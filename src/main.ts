/**
 * Sheets to GroupMe Integration
 *
 * Automate adding members to GroupMe from Google Sheets.
 */

import { Effect } from "effect";
import { error, info } from "./core/logger";
import { runSync } from "./sync/sync";

const program = Effect.gen(function* () {
  info("Sheets to GroupMe sync starting...");

  const result = yield* runSync;

  info("Sync complete", {
    added: result.added,
    skipped: result.skipped,
    errors: result.errors,
    duration: `${result.duration}ms`,
  });
}).pipe(
  Effect.catchAll((err: unknown) => {
    error("Fatal error", { message: err instanceof Error ? err.message : "Unknown error" });
    return Effect.succeed(undefined);
  })
);

Effect.runPromise(program);
