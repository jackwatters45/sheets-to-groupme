import { Layer } from "effect";
import { NotifyService } from "../error/notify";
import { GoogleSheetsService } from "../google/client";
import { GroupMeService } from "../groupme/client";
import type { ProcessedRow, SyncState } from "../state/store";
import { type TestConfig, createTestConfigProvider } from "./config";

/**
 * Creates a mock SyncState for testing.
 *
 * @param lastRun - The last run timestamp (null if never run)
 * @param processedRows - Map or Record of processed rows
 */
export const createMockState = (
  lastRun: string | null = null,
  processedRows?: Map<string, ProcessedRow> | Record<string, ProcessedRow>
): SyncState => ({
  lastRun,
  processedRows:
    processedRows instanceof Map ? processedRows : new Map(Object.entries(processedRows || {})),
});

/**
 * Creates a test layer for GoogleSheetsService with the given config.
 */
export const createGoogleTestLayer = (config: TestConfig) =>
  GoogleSheetsService.Default.pipe(
    Layer.provide(Layer.setConfigProvider(createTestConfigProvider(config)))
  );

/**
 * Creates a test layer for GroupMeService with the given config.
 */
export const createGroupMeTestLayer = (config: TestConfig) =>
  GroupMeService.Default.pipe(
    Layer.provide(Layer.setConfigProvider(createTestConfigProvider(config)))
  );

/**
 * Creates a test layer for NotifyService with the given config.
 */
export const createNotifyTestLayer = (config: TestConfig) =>
  NotifyService.Default.pipe(
    Layer.provide(Layer.setConfigProvider(createTestConfigProvider(config)))
  );
