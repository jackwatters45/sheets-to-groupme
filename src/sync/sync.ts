import { Array as Arr, Data, Effect } from "effect";
import { AppConfig } from "../config";
import {
  SyncResult,
  SyncResultDetail,
  SyncResultFailedRow,
  type UserContact,
} from "../core/schema";
import { GoogleSheetsService } from "../google/client";
import { type GroupMeMember, GroupMeService } from "../groupme/client";
import {
  StateService,
  type SyncState,
  generateRowId,
  isDuplicateRow,
  markRowAsProcessed,
} from "../state/store";

export class SyncError extends Data.TaggedError("SyncError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const DEFAULT_RANGE = "A:Z";

interface ProcessingContext {
  state: SyncState;
  added: number;
  skipped: number;
  errors: number;
  failedCount: number;
  details: SyncResultDetail[];
  failedRows: SyncResultFailedRow[];
}

export class SyncService extends Effect.Service<SyncService>()("SyncService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig;
    const stateService = yield* StateService;
    const googleSheetsService = yield* GoogleSheetsService;
    const groupMeService = yield* GroupMeService;

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
                new SyncResultDetail({
                  rowId,
                  name: contact.name,
                  status: "skipped",
                  error: "already_processed",
                  timestamp,
                }),
              ],
              failedRows: context.failedRows,
            };
          }
        }

        const member: GroupMeMember = {
          nickname: contact.name,
          ...(contact.email !== undefined && { email: contact.email }),
          ...(contact.phone !== undefined && { phone_number: contact.phone }),
        };

        const addResult = yield* groupMeService.addMember(groupId, member).pipe(
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
              new SyncResultDetail({
                rowId,
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
            state: context.state,
            added: context.added,
            skipped: context.skipped,
            errors: context.errors + 1,
            failedCount: context.failedCount + 1,
            details: [
              ...context.details,
              new SyncResultDetail({
                rowId,
                name: contact.name,
                status: "error",
                error: errorMessage,
                timestamp,
              }),
            ],
            failedRows: [
              ...context.failedRows,
              new SyncResultFailedRow({
                rowId,
                contact,
                error: errorMessage,
                timestamp,
              }),
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
            new SyncResultDetail({
              rowId,
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

      yield* Effect.logInfo("Starting sync...");

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

      const columnMapping = {
        name: config.sync.columnName,
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

      const currentState = yield* stateService.load;

      const initialContext: ProcessingContext = {
        state: currentState,
        added: 0,
        skipped: 0,
        errors: 0,
        failedCount: 0,
        details: [],
        failedRows: [],
      };

      const finalContext = yield* processContacts(
        userContacts,
        initialContext,
        config.groupme.groupId
      );

      yield* stateService.save(finalContext.state);

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
  dependencies: [StateService.Default, GoogleSheetsService.Default, GroupMeService.Default],
}) {}
