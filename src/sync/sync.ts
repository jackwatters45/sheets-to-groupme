import { Array as Arr, Effect } from "effect";
import { AppConfig } from "../config";
import { logger } from "../core/logger";
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
    status: "added" | "skipped" | "error";
    error?: string;
  }>;
}

const DEFAULT_RANGE = "A:Z";

interface ProcessingContext {
  state: SyncState;
  added: number;
  skipped: number;
  errors: number;
  details: SyncResult["details"];
}

const processContact = (
  contact: UserContact,
  context: ProcessingContext,
  groupId: string
): Effect.Effect<ProcessingContext, never> =>
  Effect.gen(function* () {
    const row = [contact.name, contact.email || "", contact.phone || ""];
    const rowId = yield* Effect.promise(() => generateRowId(row));

    if (isDuplicateRow(rowId, context.state)) {
      const updatedState = markRowAsProcessed(context.state, rowId, false);
      return {
        state: updatedState,
        added: context.added,
        skipped: context.skipped + 1,
        errors: context.errors,
        details: [
          ...context.details,
          {
            rowId,
            name: contact.name,
            status: "skipped",
            error: "already_processed",
          },
        ],
      };
    }

    const member: GroupMeMember = {
      nickname: contact.name,
      email: contact.email,
      phone_number: contact.phone,
    };

    const result = yield* addGroupMeMember(groupId, member).pipe(
      Effect.catchAll((_error) =>
        Effect.succeed({
          success: false,
          alreadyExists: false,
        })
      )
    );

    if (result.alreadyExists) {
      const updatedState = markRowAsProcessed(context.state, rowId, false);
      return {
        state: updatedState,
        added: context.added,
        skipped: context.skipped + 1,
        errors: context.errors,
        details: [
          ...context.details,
          {
            rowId,
            name: contact.name,
            status: "skipped",
            error: "already_exists",
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
      details: [
        ...context.details,
        {
          rowId,
          name: contact.name,
          status: "added",
        },
      ],
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

  logger.info("Starting sync...");

  const rows = yield* fetchRows(config.google.sheetId, DEFAULT_RANGE);

  if (rows.length === 0) {
    logger.info("No rows found in Google Sheet");
    return yield* Effect.succeed({
      added: 0,
      skipped: 0,
      errors: 0,
      duration: Date.now() - startTime,
      details: [],
    });
  }

  const columnMapping = {
    name: config.sync.columnName,
    email: config.sync.columnEmail,
    phone: config.sync.columnPhone,
  };

  const userContacts = yield* parseUserContacts(rows, columnMapping);

  if (userContacts.length === 0) {
    logger.info("No valid user contacts found");
    return yield* Effect.succeed({
      added: 0,
      skipped: 0,
      errors: 0,
      duration: Date.now() - startTime,
      details: [],
    });
  }

  logger.info(`Found ${userContacts.length} user contacts`);

  const currentState = yield* loadState();

  const initialContext: ProcessingContext = {
    state: currentState,
    added: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const finalContext = yield* processContacts(userContacts, initialContext, config.groupme.groupId);

  yield* saveState(finalContext.state);

  const duration = Date.now() - startTime;
  logger.info(
    `Sync complete: added=${finalContext.added}, skipped=${finalContext.skipped}, errors=${finalContext.errors}, duration=${duration}ms`
  );

  return {
    added: finalContext.added,
    skipped: finalContext.skipped,
    errors: finalContext.errors,
    duration,
    details: finalContext.details,
  };
});
