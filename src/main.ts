/**
 * Sheets to GroupMe Integration
 *
 * Automate adding members to GroupMe from Google Sheets.
 * Run with cron scheduler for hourly syncs.
 */

import { Effect } from "effect";
import { runHourlySync } from "./scheduler/cron";

Effect.runPromise(runHourlySync).catch(console.error);
