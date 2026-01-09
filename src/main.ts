/**
 * Sheets to GroupMe Integration
 *
 * Automate adding members to GroupMe from Google Sheets.
 * Run with cron scheduler for hourly syncs.
 */

import { runHourlySync } from "./scheduler/cron";

runHourlySync().catch(console.error);
