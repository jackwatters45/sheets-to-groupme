import { Console, Cron, Effect, Schedule } from "effect";
import { NotifyService } from "../error/notify";
import { SyncService } from "../sync/sync";

/**
 * Cron expression for running every hour on the hour.
 * Format: minute hour day-of-month month day-of-week
 */
const hourlyCron = Cron.unsafeParse("0 * * * *");

/**
 * Schedule that triggers every hour on the hour.
 */
const hourlySchedule = Schedule.cron(hourlyCron);

/**
 * Cron scheduler service for running periodic syncs.
 */
export class CronService extends Effect.Service<CronService>()("CronService", {
  effect: Effect.gen(function* () {
    const syncService = yield* SyncService;
    const notifyService = yield* NotifyService;

    const syncOnce = Effect.gen(function* () {
      yield* Console.log("[INFO] Starting sync job...");

      const result = yield* syncService.run;

      yield* Console.log(
        `[INFO] Sync complete: added=${result.added}, skipped=${result.skipped}, errors=${result.errors}, duration=${result.duration}ms`
      );

      // Send success notification (best-effort, don't crash on failure)
      yield* notifyService
        .notifySuccess({
          added: result.added,
          skipped: result.skipped,
          errors: result.errors,
        })
        .pipe(
          Effect.catchAll((error) =>
            Console.error(`[WARN] Failed to send success notification: ${error.message}`)
          )
        );

      return result;
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Console.error(
            `[ERROR] Sync failed: ${error instanceof Error ? error.message : String(error)}`
          );

          // Try to send error notification (best-effort)
          yield* notifyService
            .notifyError(error)
            .pipe(
              Effect.catchAll((notifyError) =>
                Console.error(`[WARN] Failed to send error notification: ${notifyError.message}`)
              )
            );

          return { added: 0, skipped: 0, errors: 1, duration: 0, details: [], failedRows: [] };
        })
      )
    );

    const runHourly = Effect.gen(function* () {
      yield* Console.log("[INFO] Starting cron scheduler (hourly at :00)");

      // Run once immediately
      yield* syncOnce;

      // Then repeat on the hourly schedule
      yield* syncOnce.pipe(
        Effect.repeat(hourlySchedule),
        Effect.catchAllCause((cause) =>
          Console.error(`[ERROR] Scheduler stopped unexpectedly: ${cause}`)
        )
      );
    }).pipe(Effect.interruptible);

    return { syncOnce, runHourly };
  }),
  dependencies: [SyncService.Default, NotifyService.Default],
}) {}

/**
 * Run the sync job every hour using Effect's cron scheduler.
 * This is the main entry point for the scheduled application.
 */
export const runHourlySync = Effect.gen(function* () {
  const cronService = yield* CronService;
  yield* cronService.runHourly;
}).pipe(Effect.provide(CronService.Default));
