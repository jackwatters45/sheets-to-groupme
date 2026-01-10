import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
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
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dataDir = path.join(process.cwd(), "data");
    const statePath = path.join(dataDir, STATE_FILE_NAME);

    const ensureDataDir = fs.makeDirectory(dataDir, { recursive: true }).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          new StateError({
            message: error.message,
            cause: error,
          })
        )
      )
    );

    const load = Effect.gen(function* () {
      yield* ensureDataDir;

      const emptyState: SyncState = {
        lastRun: null,
        processedRows: new Map<string, ProcessedRow>(),
      };

      const result = yield* fs.readFileString(statePath, "utf8").pipe(
        Effect.map((content) => {
          const parsed = JSON.parse(content) as {
            lastRun: string | null;
            processedRows: Record<string, ProcessedRow>;
          };
          return {
            lastRun: parsed.lastRun,
            processedRows: new Map(Object.entries(parsed.processedRows || {})),
          };
        }),
        Effect.catchAll(() => Effect.succeed(emptyState))
      );

      return result;
    });

    const save = (state: SyncState) =>
      Effect.gen(function* () {
        yield* ensureDataDir;

        const serialized = JSON.stringify(
          {
            lastRun: state.lastRun,
            processedRows: Object.fromEntries(state.processedRows),
          },
          null,
          2
        );

        yield* fs.writeFileString(statePath, serialized).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new StateError({
                message: error.message,
                cause: error,
              })
            )
          )
        );
      });

    return { load, save };
  }),
  dependencies: [NodeFileSystem.layer, NodePath.layer],
}) {}
