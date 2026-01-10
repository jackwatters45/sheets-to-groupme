import { Effect, Schedule, Cron, Console } from "effect";
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
 * Run a single sync and log the result.
 */
const syncOnce = Effect.gen(function* () {
  yield* Console.log("[INFO] Starting sync job...");
  const syncService = yield* SyncService;
  const result = yield* syncService.run;
  yield* Console.log(
    `[INFO] Sync complete: added=${result.added}, skipped=${result.skipped}, errors=${result.errors}, duration=${result.duration}ms`
  );
  return result;
}).pipe(
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Console.error(
        `[ERROR] Sync failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { added: 0, skipped: 0, errors: 1, duration: 0, details: [], failedRows: [] };
    })
  ),
  Effect.provide(SyncService.Default)
);

/**
 * Run the sync job every hour using Effect's cron scheduler.
 * This is the main entry point for the scheduled application.
 */
export const runHourlySync = Effect.gen(function* () {
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
