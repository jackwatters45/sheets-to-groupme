import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Array as Arr, Data, Effect } from "effect";
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
 * Exclusion list structure for skipping known contacts.
 */
interface ExclusionList {
  names: string[];
  emails: string[];
  phones: string[];
}

const EXCLUSION_FILE_PATH = "sync-exclude.json";

/**
 * Load exclusion list from file. Returns empty lists if file doesn't exist.
 */
export const loadExclusionList = (): ExclusionList => {
  if (!existsSync(EXCLUSION_FILE_PATH)) {
    return { names: [], emails: [], phones: [] };
  }
  try {
    const content = readFileSync(EXCLUSION_FILE_PATH, "utf-8");
    const parsed = JSON.parse(content) as Partial<ExclusionList>;
    return {
      names: parsed.names ?? [],
      emails: parsed.emails ?? [],
      phones: parsed.phones ?? [],
    };
  } catch {
    return { names: [], emails: [], phones: [] };
  }
};

/**
 * Normalize phone number to digits only for comparison.
 */
const normalizePhone = (phone: string): string => phone.replace(/\D/g, "");

/**
 * Check if a contact is in the exclusion list.
 */
export const isContactExcluded = (contact: UserContact, exclusions: ExclusionList): boolean => {
  // Check name (case-insensitive)
  if (exclusions.names.some((name) => name.toLowerCase() === contact.name.toLowerCase())) {
    return true;
  }
  // Check email (case-insensitive)
  if (
    contact.email &&
    exclusions.emails.some((email) => email.toLowerCase() === contact.email?.toLowerCase())
  ) {
    return true;
  }
  // Check phone (normalized)
  if (
    contact.phone &&
    exclusions.phones.some((phone) => normalizePhone(phone) === normalizePhone(contact.phone ?? ""))
  ) {
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

    // Load exclusion list once at service creation
    const exclusions = loadExclusionList();
    const exclusionCount =
      exclusions.names.length + exclusions.emails.length + exclusions.phones.length;

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
        yield* Effect.logInfo(`Loaded ${exclusionCount} exclusions from ${EXCLUSION_FILE_PATH}`);
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
  dependencies: [GoogleSheetsService.Default, GroupMeService.Default],
}) {}
