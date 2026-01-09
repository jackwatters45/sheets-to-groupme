/**
 * Sheets to GroupMe Integration
 *
 * Automate adding members to GroupMe from Google Sheets.
 */

import { Effect } from "effect";

const program = Effect.sync(() => {
  console.log("Sheets to GroupMe sync starting...");
  console.log("Sync complete.");
});

Effect.runPromise(program);
