/**
 * Sheets to GroupMe Integration
 *
 * Automate adding members to GroupMe from Google Sheets.
 * Run with cron scheduler for hourly syncs.
 */

import { Effect, Layer } from "effect";
import { HealthServerLive } from "./health/server";
import { runHourlySync } from "./scheduler/cron";

// Start health server and run cron scheduler
const main = Effect.gen(function* () {
  // Start health server in background (for /health and /ready endpoints)
  yield* Effect.forkDaemon(Layer.launch(HealthServerLive));

  // Run the hourly sync scheduler
  yield* runHourlySync;
});

Effect.runPromise(main).catch(console.error);
