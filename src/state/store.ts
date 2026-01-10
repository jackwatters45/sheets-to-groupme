import * as NodeFs from "node:fs/promises";
import * as NodePath from "node:path";
import { Data, Effect } from "effect";

// Types
export interface ProcessedRow {
  readonly rowId: string;
  readonly timestamp: string;
  readonly success: boolean;
}

export interface SyncState {
  readonly lastRun: string | null;
  readonly processedRows: ReadonlyMap<string, ProcessedRow>;
}

// Error
export class StateError extends Data.TaggedError("StateError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// Constants
const STATE_FILE_NAME = "state.json";
const HASH_ALGORITHM = "SHA-256";

// Pure utility functions
const hashRowData = async (row: string[]): Promise<string> => {
  const data = row.join("|");
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex.substring(0, 16);
};

export const generateRowId = async (row: string[]): Promise<string> => {
  if (row.length === 0) {
    return `empty_${Date.now()}`;
  }
  return hashRowData(row);
};

export const isDuplicateRow = (rowId: string, state: SyncState): boolean => {
  return state.processedRows.has(rowId);
};

export const markRowAsProcessed = (
  state: SyncState,
  rowId: string,
  success: boolean
): SyncState => {
  const timestamp = new Date().toISOString();
  const newProcessedRows = new Map(state.processedRows);
  newProcessedRows.set(rowId, {
    rowId,
    timestamp,
    success,
  });
  return {
    lastRun: state.lastRun || timestamp,
    processedRows: newProcessedRows,
  };
};

// Service
export class StateService extends Effect.Service<StateService>()("StateService", {
  effect: Effect.gen(function* () {
    const dataDir = NodePath.join(process.cwd(), "data");

    const ensureDataDir = Effect.tryPromise({
      try: async () => await NodeFs.mkdir(dataDir, { recursive: true }),
      catch: (error) =>
        new StateError({
          message: error instanceof Error ? error.message : "Failed to create data directory",
          cause: error,
        }),
    });

    const load = Effect.gen(function* () {
      yield* ensureDataDir;
      const statePath = NodePath.join(dataDir, STATE_FILE_NAME);

      const result = yield* Effect.tryPromise({
        try: async () => {
          const content = await NodeFs.readFile(statePath, "utf-8");
          const parsed = JSON.parse(content) as {
            lastRun: string | null;
            processedRows: Record<string, ProcessedRow>;
          };
          return {
            lastRun: parsed.lastRun,
            processedRows: new Map(Object.entries(parsed.processedRows || {})),
          };
        },
        catch: () => null,
      });

      if (result === null) {
        return {
          lastRun: null,
          processedRows: new Map<string, ProcessedRow>(),
        };
      }

      return result;
    });

    const save = (state: SyncState) =>
      Effect.gen(function* () {
        yield* ensureDataDir;
        const statePath = NodePath.join(dataDir, STATE_FILE_NAME);

        const serialized = JSON.stringify(
          {
            lastRun: state.lastRun,
            processedRows: Object.fromEntries(state.processedRows),
          },
          null,
          2
        );

        yield* Effect.tryPromise({
          try: async () => await NodeFs.writeFile(statePath, serialized, "utf-8"),
          catch: (error) =>
            new StateError({
              message: error instanceof Error ? error.message : "Failed to write state file",
              cause: error,
            }),
        });
      });

    return { load, save };
  }),
  dependencies: [],
}) {}
