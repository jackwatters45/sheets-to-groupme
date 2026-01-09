import { Effect } from "effect";
import { error, info } from "../core/logger";
import { runSync } from "../sync/sync";

const ONE_HOUR_MS = 60 * 60 * 1000;

let isShuttingDown = false;

const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  info("Shutdown signal received, stopping cron...");
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/**
 * Run the sync job every hour.
 * This is the main entry point for the scheduled application.
 */
export const runHourlySync = async (): Promise<void> => {
  info(`Starting cron scheduler with ${ONE_HOUR_MS}ms interval`);

  const runOnce = async (): Promise<void> => {
    try {
      const result = await Effect.runPromise(runSync);
      info("Sync complete", {
        added: result.added,
        skipped: result.skipped,
        errors: result.errors,
        duration: `${result.duration}ms`,
      });
    } catch (err) {
      error("Sync failed", {
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  await runOnce();

  const intervalId = setInterval(async () => {
    if (isShuttingDown) {
      clearInterval(intervalId);
      return;
    }
    await runOnce();
  }, ONE_HOUR_MS);

  while (!isShuttingDown) {
    await Effect.sleep(1000);
  }

  clearInterval(intervalId);
  process.off("SIGTERM", shutdown);
  process.off("SIGINT", shutdown);
  info("Cron scheduler stopped");
};
