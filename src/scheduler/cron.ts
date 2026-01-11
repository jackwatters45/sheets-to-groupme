import { Console, Cron, Duration, Effect, Schedule } from "effect";
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

    // Retry schedule for transient network errors (3 retries with exponential backoff)
    const retrySchedule = Schedule.exponential(Duration.seconds(2)).pipe(
      Schedule.intersect(Schedule.recurs(3))
    );

    // Shared notification helpers
    const notifySuccess = (result: { added: number; skipped: number; errors: number }) =>
      notifyService
        .notifySuccess(result)
        .pipe(
          Effect.catchAll((error) =>
            Console.error(`[WARN] Failed to send success notification: ${error.message}`)
          )
        );

    const handleSyncError = (errorLabel: string) => (error: unknown) =>
      Effect.gen(function* () {
        yield* Console.error(
          `[ERROR] ${errorLabel}: ${error instanceof Error ? error.message : String(error)}`
        );
        yield* notifyService
          .notifyError(error)
          .pipe(
            Effect.catchAll((notifyError) =>
              Console.error(`[WARN] Failed to send error notification: ${notifyError.message}`)
            )
          );
        return { added: 0, skipped: 0, errors: 1, duration: 0, details: [], failedRows: [] };
      });

    // Core sync operation that can fail (for retry purposes)
    const syncCore = Effect.gen(function* () {
      yield* Console.log("[INFO] Starting sync job...");
      const result = yield* syncService.run;
      yield* Console.log(
        `[INFO] Sync complete: added=${result.added}, skipped=${result.skipped}, errors=${result.errors}, duration=${result.duration}ms`
      );
      return result;
    });

    // Sync with retry on transient failures (used in production)
    const syncWithRetry = syncCore.pipe(
      Effect.retry(retrySchedule),
      Effect.tap(notifySuccess),
      Effect.catchAll(handleSyncError("Sync failed after retries"))
    );

    // Sync without retry (used in tests)
    const syncOnce = syncCore.pipe(
      Effect.tap(notifySuccess),
      Effect.catchAll(handleSyncError("Sync failed"))
    );

    const runHourly = Effect.gen(function* () {
      yield* Console.log("[INFO] Starting cron scheduler (hourly at :00)");

      // Wait for network to be ready before first sync
      yield* Console.log("[INFO] Waiting 3s for network initialization...");
      yield* Effect.sleep(Duration.seconds(3));

      // Run once immediately (with retry)
      yield* syncWithRetry;

      // Then repeat on the hourly schedule
      yield* syncWithRetry.pipe(
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
