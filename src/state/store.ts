import type { StateStore, SyncState } from "./types";

export const stateStore: StateStore = {
  load: async (): Promise<SyncState> => {
    return { lastRun: null, processedRowIds: new Set() };
  },
  save: async (_state: SyncState): Promise<void> => {
    // TODO: Implement
  },
};

export const loadState = stateStore.load;
export const saveState = stateStore.save;
