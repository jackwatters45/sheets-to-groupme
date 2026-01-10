import { Array as Arr, Effect } from "effect";
import { AppConfig } from "../config";
import { type UserContact, fetchRows, parseUserContacts } from "../google/client";
import { type GroupMeMember, addGroupMeMember } from "../groupme/client";
import {
  type SyncState,
  generateRowId,
  isDuplicateRow,
  loadState,
  markRowAsProcessed,
  saveState,
} from "../state/store";

export interface SyncResult {
  added: number;
  skipped: number;
  errors: number;
  duration: number;
  details: Array<{
    rowId: string;
    name: string;
    status: "added" | "skipped" | "error" | "failed";
    error?: string;
    timestamp?: string;
  }>;
  failedRows: Array<{
    rowId: string;
    contact: UserContact;
    error: string;
    timestamp: string;
  }>;
}

const DEFAULT_RANGE = "A:Z";

interface ProcessingContext {
  state: SyncState;
  added: number;
  skipped: number;
  errors: number;
  failedCount: number;
  details: SyncResult["details"];
  failedRows: SyncResult["failedRows"];
}

const processContact = (
  contact: UserContact,
  context: ProcessingContext,
  groupId: string
): Effect.Effect<ProcessingContext, never> =>
  Effect.gen(function* () {
    const row = [contact.name, contact.email || "", contact.phone || ""];
    const rowId = yield* Effect.promise(() => generateRowId(row));
    const timestamp = new Date().toISOString();

    if (isDuplicateRow(rowId, context.state)) {
      const existingRow = context.state.processedRows.get(rowId);
      const wasSuccessful = existingRow?.success ?? false;

      if (wasSuccessful) {
        const updatedState = markRowAsProcessed(context.state, rowId, false);
        return {
          state: updatedState,
          added: context.added,
          skipped: context.skipped + 1,
          errors: context.errors,
          failedCount: context.failedCount,
          details: [
            ...context.details,
            {
              rowId,
              name: contact.name,
              status: "skipped",
              error: "already_processed",
              timestamp,
            },
          ],
          failedRows: context.failedRows,
        };
      }
    }

    const member: GroupMeMember = {
      nickname: contact.name,
      email: contact.email,
      phone_number: contact.phone,
    };

    const addResult = yield* addGroupMeMember(groupId, member).pipe(
      Effect.catchAll((error) =>
        Effect.succeed({
          success: false,
          alreadyExists: false,
          errorMessage: error.message,
        })
      )
    );

    if (addResult.alreadyExists) {
      const updatedState = markRowAsProcessed(context.state, rowId, false);
      return {
        state: updatedState,
        added: context.added,
        skipped: context.skipped + 1,
        errors: context.errors,
        failedCount: context.failedCount,
        details: [
          ...context.details,
          {
            rowId,
            name: contact.name,
            status: "skipped",
            error: "already_exists",
            timestamp,
          },
        ],
        failedRows: context.failedRows,
      };
    }

    if (!addResult.success) {
      const errorMessage = (addResult as { errorMessage?: string }).errorMessage ?? "Unknown error";
      yield* Effect.logError(`Failed to add member ${contact.name}: ${errorMessage}`);

      return {
        state: context.state,
        added: context.added,
        skipped: context.skipped,
        errors: context.errors + 1,
        failedCount: context.failedCount + 1,
        details: [
          ...context.details,
          {
            rowId,
            name: contact.name,
            status: "error",
            error: errorMessage,
            timestamp,
          },
        ],
        failedRows: [
          ...context.failedRows,
          {
            rowId,
            contact,
            error: errorMessage,
            timestamp,
          },
        ],
      };
    }

    const updatedState = markRowAsProcessed(context.state, rowId, true);
    return {
      state: updatedState,
      added: context.added + 1,
      skipped: context.skipped,
      errors: context.errors,
      failedCount: context.failedCount,
      details: [
        ...context.details,
        {
          rowId,
          name: contact.name,
          status: "added",
          timestamp,
        },
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

export const runSync = Effect.gen(function* () {
  const startTime = Date.now();
  const config = yield* AppConfig;

  yield* Effect.logInfo("Starting sync...");

  const rows = yield* fetchRows(config.google.sheetId, DEFAULT_RANGE);

  if (rows.length === 0) {
    yield* Effect.logInfo("No rows found in Google Sheet");
    return yield* Effect.succeed({
      added: 0,
      skipped: 0,
      errors: 0,
      duration: Date.now() - startTime,
      details: [],
      failedRows: [],
    });
  }

  const columnMapping = {
    name: config.sync.columnName,
    email: config.sync.columnEmail,
    phone: config.sync.columnPhone,
  };

  const userContacts = yield* parseUserContacts(rows, columnMapping);

  if (userContacts.length === 0) {
    yield* Effect.logInfo("No valid user contacts found");
    return yield* Effect.succeed({
      added: 0,
      skipped: 0,
      errors: 0,
      duration: Date.now() - startTime,
      details: [],
      failedRows: [],
    });
  }

  yield* Effect.logInfo(`Found ${userContacts.length} user contacts`);

  const currentState = yield* loadState();

  const initialContext: ProcessingContext = {
    state: currentState,
    added: 0,
    skipped: 0,
    errors: 0,
    failedCount: 0,
    details: [],
    failedRows: [],
  };

  const finalContext = yield* processContacts(userContacts, initialContext, config.groupme.groupId);

  yield* saveState(finalContext.state);

  const duration = Date.now() - startTime;
  yield* Effect.logInfo(
    `Sync complete: added=${finalContext.added}, skipped=${finalContext.skipped}, errors=${finalContext.errors}, duration=${duration}ms`
  );

  return {
    added: finalContext.added,
    skipped: finalContext.skipped,
    errors: finalContext.errors,
    duration,
    details: finalContext.details,
    failedRows: finalContext.failedRows,
  };
});
