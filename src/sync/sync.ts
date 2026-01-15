import { createHash } from "node:crypto";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Array as Arr, Data, Effect, Schema } from "effect";
import { AppConfig } from "../config";
import {
  SyncResult,
  SyncResultDetail,
  SyncResultFailedRow,
  type UserContact,
} from "../core/schema";
import { GoogleSheetsService } from "../google/client";
import {
  type GroupMeMember,
  GroupMeService,
  type GroupMember,
  isContactInGroup,
} from "../groupme/client";

/**
 * Exclusion list schema for validation.
 */
export class ExclusionList extends Schema.Class<ExclusionList>("ExclusionList")({
  names: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  emails: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  phones: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
}) {}

/**
 * Normalized exclusion list with Sets for O(1) lookups.
 */
export interface NormalizedExclusions {
  names: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
}

/**
 * Normalize phone number to digits only for comparison.
 */
const normalizePhone = (phone: string): string => phone.replace(/\D/g, "");

/**
 * Convert ExclusionList to NormalizedExclusions with Sets and normalized values.
 */
export const normalizeExclusions = (list: ExclusionList): NormalizedExclusions => ({
  names: new Set(list.names.map((n: string) => n.toLowerCase())),
  emails: new Set(list.emails.map((e: string) => e.toLowerCase())),
  phones: new Set(list.phones.map((p: string) => normalizePhone(p))),
});

class ExclusionParseError extends Data.TaggedError("ExclusionParseError")<{
  readonly message: string;
}> {}

const emptyExclusionList = () => new ExclusionList({ names: [], emails: [], phones: [] });

/**
 * Load and parse exclusion list from file using Effect FileSystem.
 * Returns empty lists if file doesn't exist or is invalid.
 */
export const loadExclusionList = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const exists = yield* fs.exists(filePath);
    if (!exists) {
      return emptyExclusionList();
    }

    const content = yield* fs.readFileString(filePath).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(`Failed to read exclusion file: ${error.message}`);
          return "";
        })
      )
    );

    if (!content) {
      return emptyExclusionList();
    }

    const parsed = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (error) =>
        new ExclusionParseError({
          message: `Failed to parse exclusion JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
        }),
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(error.message);
          return null;
        })
      )
    );

    if (!parsed) {
      return emptyExclusionList();
    }

    const decoded = yield* Schema.decodeUnknown(ExclusionList)(parsed).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(`Invalid exclusion file schema: ${error.message}`);
          return emptyExclusionList();
        })
      )
    );

    return decoded;
  });

/**
 * Check if a contact is in the exclusion list using normalized Sets.
 */
export const isContactExcluded = (
  contact: UserContact,
  exclusions: NormalizedExclusions
): boolean => {
  // Check name (case-insensitive, O(1) lookup)
  if (exclusions.names.has(contact.name.toLowerCase())) {
    return true;
  }

  // Check email (case-insensitive, O(1) lookup)
  if (contact.email && exclusions.emails.has(contact.email.toLowerCase())) {
    return true;
  }

  // Check phone (normalized, O(1) lookup)
  if (contact.phone && exclusions.phones.has(normalizePhone(contact.phone))) {
    return true;
  }

  return false;
};

export class SyncError extends Data.TaggedError("SyncError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const DEFAULT_RANGE = "A:Z";

// In-memory storage for change detection
let lastSheetHash: string | null = null;

/**
 * Compute a SHA-256 hash of sheet rows for change detection.
 * Rows are sorted to ensure consistent hashing regardless of row order.
 */
export const computeSheetHash = (rows: string[][]): string => {
  // Sort rows for consistent hashing (by joining each row)
  const sortedRows = [...rows].sort((a, b) => a.join(",").localeCompare(b.join(",")));
  const data = JSON.stringify(sortedRows);
  const hash = createHash("sha256").update(data).digest("hex");
  return hash;
};

/**
 * Reset the stored hash (useful for testing).
 */
export const resetSheetHash = (): void => {
  lastSheetHash = null;
};

interface ProcessingContext {
  existingMembers: readonly GroupMember[];
  added: number;
  skipped: number;
  errors: number;
  details: SyncResultDetail[];
  failedRows: SyncResultFailedRow[];
}

export class SyncService extends Effect.Service<SyncService>()("SyncService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig;
    const googleSheetsService = yield* GoogleSheetsService;
    const groupMeService = yield* GroupMeService;

    // Load and normalize exclusion list once at service creation
    const rawExclusions = yield* loadExclusionList(config.sync.exclusionFilePath);
    const exclusions = normalizeExclusions(rawExclusions);
    const exclusionCount = exclusions.names.size + exclusions.emails.size + exclusions.phones.size;

    const processContact = (
      contact: UserContact,
      context: ProcessingContext,
      groupId: string
    ): Effect.Effect<ProcessingContext, never> =>
      Effect.gen(function* () {
        const timestamp = new Date().toISOString();

        // Check if contact is in exclusion list
        if (isContactExcluded(contact, exclusions)) {
          yield* Effect.logDebug(`Skipping ${contact.name}: in exclusion list`);
          return {
            existingMembers: context.existingMembers,
            added: context.added,
            skipped: context.skipped + 1,
            errors: context.errors,
            details: [
              ...context.details,
              new SyncResultDetail({
                name: contact.name,
                status: "skipped",
                error: "excluded",
                timestamp,
              }),
            ],
            failedRows: context.failedRows,
          };
        }

        // Check if contact is already in the group
        if (isContactInGroup(contact, context.existingMembers)) {
          yield* Effect.logDebug(
            `Skipping ${contact.name}: already in group (matched by name/email/phone)`
          );
          return {
            existingMembers: context.existingMembers,
            added: context.added,
            skipped: context.skipped + 1,
            errors: context.errors,
            details: [
              ...context.details,
              new SyncResultDetail({
                name: contact.name,
                status: "skipped",
                error: "already_in_group",
                timestamp,
              }),
            ],
            failedRows: context.failedRows,
          };
        }

        const member: GroupMeMember = {
          nickname: contact.name,
          ...(contact.email !== undefined && { email: contact.email }),
          ...(contact.phone !== undefined && { phone_number: contact.phone }),
        };

        // Dry run mode: log what would happen without actually adding
        if (config.sync.dryRun) {
          const contactInfo =
            [contact.email, contact.phone].filter(Boolean).join(", ") || "no contact info";
          yield* Effect.logInfo(`[DRY RUN] Would add: ${contact.name} (${contactInfo})`);
          return {
            existingMembers: context.existingMembers,
            added: context.added + 1,
            skipped: context.skipped,
            errors: context.errors,
            details: [
              ...context.details,
              new SyncResultDetail({
                name: contact.name,
                status: "added",
                error: "dry_run",
                timestamp,
              }),
            ],
            failedRows: context.failedRows,
          };
        }

        const addResult = yield* groupMeService.addMember(groupId, member).pipe(
          Effect.catchAll((error) =>
            Effect.succeed({
              success: false,
              alreadyExists: error._tag === "GroupMeMemberAlreadyExistsError",
              errorMessage: error.message,
            })
          )
        );

        // Handle race condition: member added between our check and addMember call
        if (addResult.alreadyExists) {
          yield* Effect.logDebug(`Skipping ${contact.name}: already exists in GroupMe`);
          return {
            existingMembers: context.existingMembers,
            added: context.added,
            skipped: context.skipped + 1,
            errors: context.errors,
            details: [
              ...context.details,
              new SyncResultDetail({
                name: contact.name,
                status: "skipped",
                error: "already_exists",
                timestamp,
              }),
            ],
            failedRows: context.failedRows,
          };
        }

        if (!addResult.success) {
          const errorMessage =
            (addResult as { errorMessage?: string }).errorMessage ?? "Unknown error";
          yield* Effect.logError(`Failed to add member ${contact.name}: ${errorMessage}`);

          return {
            existingMembers: context.existingMembers,
            added: context.added,
            skipped: context.skipped,
            errors: context.errors + 1,
            details: [
              ...context.details,
              new SyncResultDetail({
                name: contact.name,
                status: "error",
                error: errorMessage,
                timestamp,
              }),
            ],
            failedRows: [
              ...context.failedRows,
              new SyncResultFailedRow({
                contact,
                error: errorMessage,
                timestamp,
              }),
            ],
          };
        }

        return {
          existingMembers: context.existingMembers,
          added: context.added + 1,
          skipped: context.skipped,
          errors: context.errors,
          details: [
            ...context.details,
            new SyncResultDetail({
              name: contact.name,
              status: "added",
              timestamp,
            }),
          ],
          failedRows: context.failedRows,
        };
      });

    const processContacts = (
      contacts: UserContact[],
      initialContext: ProcessingContext,
      groupId: string
    ): Effect.Effect<ProcessingContext, never> =>
      Arr.reduce(contacts, Effect.succeed(initialContext), (acc, contact) =>
        Effect.flatMap(acc, (ctx) => processContact(contact, ctx, groupId))
      );

    const run = Effect.gen(function* () {
      const startTime = Date.now();

      if (config.sync.dryRun) {
        yield* Effect.logInfo(
          "Starting sync in DRY RUN mode (no changes will be made to GroupMe)..."
        );
      } else {
        yield* Effect.logInfo("Starting sync...");
      }

      if (exclusionCount > 0) {
        yield* Effect.logInfo(
          `Loaded ${exclusionCount} exclusions from ${config.sync.exclusionFilePath}`
        );
      }

      // Fetch current group members from GroupMe
      // Fail fast if we can't get members - proceeding without them would disable duplicate detection
      const existingMembers = yield* groupMeService.getMembers(config.groupme.groupId).pipe(
        Effect.mapError(
          (error) =>
            new SyncError({
              message: `Cannot sync without member list - duplicate detection would be disabled: ${error.message}`,
              cause: error,
            })
        )
      );

      yield* Effect.logInfo(`Found ${existingMembers.length} existing members in group`);

      const rows = yield* googleSheetsService.fetchRows(config.google.sheetId, DEFAULT_RANGE);

      if (rows.length === 0) {
        yield* Effect.logInfo("No rows found in Google Sheet");
        return new SyncResult({
          added: 0,
          skipped: 0,
          errors: 0,
          duration: Date.now() - startTime,
          details: [],
          failedRows: [],
        });
      }

      // Change detection: compute hash and compare with stored hash
      const currentHash = computeSheetHash(rows);
      if (lastSheetHash !== null && currentHash === lastSheetHash) {
        yield* Effect.logInfo("No changes detected in sheet data, skipping sync");
        return new SyncResult({
          added: 0,
          skipped: 0,
          errors: 0,
          duration: Date.now() - startTime,
          details: [],
          failedRows: [],
        });
      }
      // Update stored hash for next comparison (skip in dry run so real sync still runs)
      if (!config.sync.dryRun) {
        lastSheetHash = currentHash;
      }

      const columnMapping = {
        name: config.sync.columnName,
        ...(config.sync.columnFirstName ? { firstName: config.sync.columnFirstName } : {}),
        ...(config.sync.columnLastName ? { lastName: config.sync.columnLastName } : {}),
        email: config.sync.columnEmail,
        phone: config.sync.columnPhone,
      };

      const userContacts = yield* googleSheetsService.parseUserContacts(rows, columnMapping);

      if (userContacts.length === 0) {
        yield* Effect.logInfo("No valid user contacts found");
        return new SyncResult({
          added: 0,
          skipped: 0,
          errors: 0,
          duration: Date.now() - startTime,
          details: [],
          failedRows: [],
        });
      }

      yield* Effect.logInfo(`Found ${userContacts.length} user contacts`);

      const initialContext: ProcessingContext = {
        existingMembers,
        added: 0,
        skipped: 0,
        errors: 0,
        details: [],
        failedRows: [],
      };

      const finalContext = yield* processContacts(
        userContacts,
        initialContext,
        config.groupme.groupId
      );

      const duration = Date.now() - startTime;
      yield* Effect.logInfo(
        `Sync complete: added=${finalContext.added}, skipped=${finalContext.skipped}, errors=${finalContext.errors}, duration=${duration}ms`
      );

      return new SyncResult({
        added: finalContext.added,
        skipped: finalContext.skipped,
        errors: finalContext.errors,
        duration,
        details: finalContext.details,
        failedRows: finalContext.failedRows,
      });
    });

    return { run };
  }),
  dependencies: [GoogleSheetsService.Default, GroupMeService.Default, NodeFileSystem.layer],
}) {}
