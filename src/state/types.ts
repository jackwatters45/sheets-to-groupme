export interface SyncState {
  lastRun: string | null;
  processedRowIds: ReadonlySet<string>;
}

export interface StateStore {
  load(): Promise<SyncState>;
  save(state: SyncState): Promise<void>;
}
