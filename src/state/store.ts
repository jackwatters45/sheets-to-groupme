import * as NodeFs from "node:fs/promises";
import * as NodePath from "node:path";
import { Data, Effect } from "effect";

export interface ProcessedRow {
  readonly rowId: string;
  readonly timestamp: string;
  readonly success: boolean;
}

export interface SyncState {
  readonly lastRun: string | null;
  readonly processedRows: ReadonlyMap<string, ProcessedRow>;
}

export interface StateStore {
  readonly load: () => Effect.Effect<SyncState, StateError>;
  readonly save: (state: SyncState) => Effect.Effect<void, StateError>;
}

export class StateError extends Data.TaggedError("StateError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const STATE_FILE_NAME = "state.json";

const getDataDir = Effect.succeed(NodePath.join(process.cwd(), "data"));

const ensureDataDir = (dataDir: string) =>
  Effect.tryPromise({
    try: async () => await NodeFs.mkdir(dataDir, { recursive: true }),
    catch: (error) =>
      new StateError({
        message: error instanceof Error ? error.message : "Failed to create data directory",
        cause: error,
      }),
  });

const readStateFile = (dataDir: string): Effect.Effect<SyncState, StateError> =>
  Effect.gen(function* () {
    const statePath = NodePath.join(dataDir, STATE_FILE_NAME);

    try {
      const content = yield* Effect.tryPromise({
        try: async () => await NodeFs.readFile(statePath, "utf-8"),
        catch: (error) =>
          new StateError({
            message: error instanceof Error ? error.message : "Failed to read state file",
            cause: error,
          }),
      });

      const parsed = JSON.parse(content) as {
        lastRun: string | null;
        processedRows: Record<string, ProcessedRow>;
      };

      return {
        lastRun: parsed.lastRun,
        processedRows: new Map(Object.entries(parsed.processedRows || {})),
      };
    } catch {
      return {
        lastRun: null,
        processedRows: new Map<string, ProcessedRow>(),
      };
    }
  });

const writeStateFile = (dataDir: string, state: SyncState): Effect.Effect<void, StateError> =>
  Effect.gen(function* () {
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

export const createStateStore = (): StateStore => {
  const load = () =>
    Effect.gen(function* () {
      const dataDir = yield* getDataDir;
      yield* ensureDataDir(dataDir);
      return yield* readStateFile(dataDir);
    });

  const save = (state: SyncState) =>
    Effect.gen(function* () {
      const dataDir = yield* getDataDir;
      yield* ensureDataDir(dataDir);
      yield* writeStateFile(dataDir, state);
    });

  return { load, save };
};

export const stateStore = createStateStore();

export const loadState = stateStore.load;
export const saveState = stateStore.save;
