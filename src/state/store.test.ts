import * as NodeFs from "node:fs/promises";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach } from "vitest";
import * as store from "./store";

// Helper to create mock state
const createMockState = (
  lastRun: string | null = null,
  processedRows?: Record<string, store.ProcessedRow>
): store.SyncState => ({
  lastRun,
  processedRows: new Map(Object.entries(processedRows || {})),
});

describe("State Store", () => {
  describe("generateRowId", () => {
    it("should return empty marker for empty row", async () => {
      const rowId = await store.generateRowId([]);
      expect(rowId).toMatch(/^empty_\d+$/);
    });

    it("should generate consistent hash for same row", async () => {
      const row = ["John Doe", "john@example.com", "555-1234"];
      const id1 = await store.generateRowId(row);
      const id2 = await store.generateRowId(row);
      expect(id1).toBe(id2);
      expect(id1).toHaveLength(16);
    });

    it("should generate different hashes for different rows", async () => {
      const row1 = ["John Doe", "john@example.com", "555-1234"];
      const row2 = ["Jane Doe", "jane@example.com", "555-5678"];

      const id1 = await store.generateRowId(row1);
      const id2 = await store.generateRowId(row2);

      expect(id1).not.toBe(id2);
    });

    it("should handle row with single element", async () => {
      const rowId = await store.generateRowId(["single"]);
      expect(rowId).toHaveLength(16);
    });

    it("should handle row with special characters", async () => {
      const row = ["Name with spaces & symbols!", "email@test.com", "+1 (555) 123-4567"];
      const rowId = await store.generateRowId(row);
      expect(rowId).toHaveLength(16);
    });
  });

  describe("isDuplicateRow", () => {
    it("should return true when rowId exists in processedRows", () => {
      const state = createMockState(null, {
        abc123: { rowId: "abc123", timestamp: "2024-01-01T00:00:00.000Z", success: true },
      });

      expect(store.isDuplicateRow("abc123", state)).toBe(true);
    });

    it("should return false when rowId does not exist", () => {
      const state = createMockState();

      expect(store.isDuplicateRow("xyz789", state)).toBe(false);
    });

    it("should return true for failed row", () => {
      const state = createMockState(null, {
        "failed-row": {
          rowId: "failed-row",
          timestamp: "2024-01-01T00:00:00.000Z",
          success: false,
        },
      });

      expect(store.isDuplicateRow("failed-row", state)).toBe(true);
    });

    it("should return false for empty state", () => {
      const state = createMockState();
      expect(store.isDuplicateRow("any-row", state)).toBe(false);
    });
  });

  describe("markRowAsProcessed", () => {
    it("should add new row to processedRows", () => {
      const initialState = createMockState();

      const newState = store.markRowAsProcessed(initialState, "new-row", true);

      expect(newState.processedRows.size).toBe(1);
      const row = newState.processedRows.get("new-row");
      expect(row).toBeDefined();
      expect(row?.rowId).toBe("new-row");
      expect(row?.success).toBe(true);
    });

    it("should preserve existing rows when adding new one", () => {
      const timestamp = "2024-01-01T00:00:00.000Z";
      const initialState = createMockState(timestamp, {
        "existing-row": { rowId: "existing-row", timestamp, success: true },
      });

      const newState = store.markRowAsProcessed(initialState, "new-row", false);

      expect(newState.processedRows.size).toBe(2);
      expect(newState.processedRows.has("existing-row")).toBe(true);
      expect(newState.processedRows.has("new-row")).toBe(true);
      expect(newState.lastRun).toBe(timestamp);
    });

    it("should update lastRun when it was null", () => {
      const initialState = createMockState(null);

      const newState = store.markRowAsProcessed(initialState, "row-id", true);

      expect(newState.lastRun).not.toBeNull();
    });

    it("should create new Map (immutability)", () => {
      const initialState = createMockState(null, {
        row1: { rowId: "row1", timestamp: "2024-01-01T00:00:00.000Z", success: true },
      });

      const newState = store.markRowAsProcessed(initialState, "row2", true);

      expect(initialState.processedRows.size).toBe(1);
      expect(newState.processedRows.size).toBe(2);
      expect(initialState.processedRows).not.toBe(newState.processedRows);
    });

    it("should update existing row", () => {
      const timestamp = "2024-01-01T00:00:00.000Z";
      const initialState = createMockState(timestamp, {
        row1: { rowId: "row1", timestamp, success: false },
      });

      const newState = store.markRowAsProcessed(initialState, "row1", true);

      const updatedRow = newState.processedRows.get("row1");
      expect(updatedRow?.success).toBe(true);
      expect(updatedRow?.timestamp).not.toBe(timestamp);
    });

    it("should set correct timestamp format", () => {
      const initialState = createMockState();

      const newState = store.markRowAsProcessed(initialState, "test-row", true);

      expect(newState.processedRows.get("test-row")?.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
    });
  });

  describe("StateError", () => {
    it("should create StateError with message and cause", () => {
      const cause = new Error("Original error");
      const error = new store.StateError({ message: "Failed", cause });
      expect(error._tag).toBe("StateError");
      expect(error.message).toBe("Failed");
      expect(error.cause).toBe(cause);
    });

    it("should create StateError without cause", () => {
      const error = new store.StateError({ message: "Simple error" });
      expect(error._tag).toBe("StateError");
      expect(error.message).toBe("Simple error");
      expect(error.cause).toBeUndefined();
    });

    it("should be distinguishable from other errors", () => {
      const stateError = new store.StateError({ message: "State failed" });
      const regularError = new Error("Regular error");
      expect(stateError._tag).not.toBe(regularError.name);
    });
  });

  describe("ProcessedRow interface", () => {
    it("should have correct interface shape", () => {
      const row: store.ProcessedRow = {
        rowId: "test-row",
        timestamp: "2024-01-01T00:00:00.000Z",
        success: true,
      };
      expect(row.rowId).toBe("test-row");
      expect(row.timestamp).toBe("2024-01-01T00:00:00.000Z");
      expect(row.success).toBe(true);
    });

    it("should allow success to be false", () => {
      const row: store.ProcessedRow = {
        rowId: "failed-row",
        timestamp: "2024-01-01T00:00:00.000Z",
        success: false,
      };
      expect(row.success).toBe(false);
    });
  });

  describe("SyncState interface", () => {
    it("should have correct interface shape", () => {
      const timestamp = "2024-01-01T00:00:00.000Z";
      const state: store.SyncState = {
        lastRun: timestamp,
        processedRows: new Map([["row1", { rowId: "row1", timestamp, success: true }]]),
      };
      expect(state.lastRun).toBe(timestamp);
      expect(state.processedRows.size).toBe(1);
    });

    it("should allow null lastRun", () => {
      const state: store.SyncState = {
        lastRun: null,
        processedRows: new Map(),
      };
      expect(state.lastRun).toBeNull();
    });

    it("should support multiple processed rows", () => {
      const timestamp = "2024-01-01T00:00:00.000Z";
      const state: store.SyncState = {
        lastRun: timestamp,
        processedRows: new Map([
          ["row1", { rowId: "row1", timestamp, success: true }],
          ["row2", { rowId: "row2", timestamp, success: false }],
          ["row3", { rowId: "row3", timestamp, success: true }],
        ]),
      };
      expect(state.processedRows.size).toBe(3);
    });
  });

  describe("StateService", () => {
    it("should be defined as a service", () => {
      expect(store.StateService).toBeDefined();
      expect(store.StateService.Default).toBeDefined();
    });
  });

  describe("StateService integration", () => {
    const testDataDir = NodePath.join(process.cwd(), "data");
    const testStatePath = NodePath.join(testDataDir, "state.json");

    beforeEach(async () => {
      // Ensure clean test state
      try {
        await NodeFs.rm(testStatePath, { force: true });
      } catch {
        // File may not exist, that's fine
      }
    });

    afterEach(async () => {
      // Clean up test state
      try {
        await NodeFs.rm(testStatePath, { force: true });
      } catch {
        // File may not exist, that's fine
      }
    });

    it.effect("should load empty state when file does not exist", () =>
      Effect.gen(function* () {
        const service = yield* store.StateService;
        const state = yield* service.load;

        expect(state.lastRun).toBeNull();
        expect(state.processedRows.size).toBe(0);
      }).pipe(Effect.provide(store.StateService.Default))
    );

    it.effect("should save and load state correctly", () =>
      Effect.gen(function* () {
        const service = yield* store.StateService;

        // Create and save state
        const stateToSave: store.SyncState = {
          lastRun: "2024-01-15T10:30:00.000Z",
          processedRows: new Map([
            ["row1", { rowId: "row1", timestamp: "2024-01-15T10:30:00.000Z", success: true }],
            ["row2", { rowId: "row2", timestamp: "2024-01-15T10:31:00.000Z", success: false }],
          ]),
        };

        yield* service.save(stateToSave);

        // Load and verify
        const loadedState = yield* service.load;

        expect(loadedState.lastRun).toBe("2024-01-15T10:30:00.000Z");
        expect(loadedState.processedRows.size).toBe(2);
        expect(loadedState.processedRows.get("row1")?.success).toBe(true);
        expect(loadedState.processedRows.get("row2")?.success).toBe(false);
      }).pipe(Effect.provide(store.StateService.Default))
    );

    it.effect("should overwrite existing state on save", () =>
      Effect.gen(function* () {
        const service = yield* store.StateService;

        // Save initial state
        const initialState: store.SyncState = {
          lastRun: "2024-01-01T00:00:00.000Z",
          processedRows: new Map([
            ["old-row", { rowId: "old-row", timestamp: "2024-01-01T00:00:00.000Z", success: true }],
          ]),
        };
        yield* service.save(initialState);

        // Save new state
        const newState: store.SyncState = {
          lastRun: "2024-01-15T12:00:00.000Z",
          processedRows: new Map([
            ["new-row", { rowId: "new-row", timestamp: "2024-01-15T12:00:00.000Z", success: true }],
          ]),
        };
        yield* service.save(newState);

        // Load and verify new state
        const loadedState = yield* service.load;

        expect(loadedState.lastRun).toBe("2024-01-15T12:00:00.000Z");
        expect(loadedState.processedRows.size).toBe(1);
        expect(loadedState.processedRows.has("new-row")).toBe(true);
        expect(loadedState.processedRows.has("old-row")).toBe(false);
      }).pipe(Effect.provide(store.StateService.Default))
    );

    it.effect("should create data directory if it does not exist", () =>
      Effect.gen(function* () {
        const service = yield* store.StateService;

        // Save state (should create directory)
        const state: store.SyncState = {
          lastRun: "2024-01-15T10:00:00.000Z",
          processedRows: new Map(),
        };
        yield* service.save(state);

        // Verify file exists
        const fileExists = yield* Effect.promise(() =>
          NodeFs.access(testStatePath)
            .then(() => true)
            .catch(() => false)
        );
        expect(fileExists).toBe(true);
      }).pipe(Effect.provide(store.StateService.Default))
    );

    it.effect("should handle empty processedRows", () =>
      Effect.gen(function* () {
        const service = yield* store.StateService;

        const state: store.SyncState = {
          lastRun: "2024-01-15T10:00:00.000Z",
          processedRows: new Map(),
        };
        yield* service.save(state);

        const loadedState = yield* service.load;
        expect(loadedState.processedRows.size).toBe(0);
        expect(loadedState.lastRun).toBe("2024-01-15T10:00:00.000Z");
      }).pipe(Effect.provide(store.StateService.Default))
    );

    it.effect("should preserve row data through save/load cycle", () =>
      Effect.gen(function* () {
        const service = yield* store.StateService;

        const row: store.ProcessedRow = {
          rowId: "test-row-123",
          timestamp: "2024-01-15T14:30:45.123Z",
          success: true,
        };

        const state: store.SyncState = {
          lastRun: "2024-01-15T14:30:45.123Z",
          processedRows: new Map([[row.rowId, row]]),
        };

        yield* service.save(state);
        const loadedState = yield* service.load;

        const loadedRow = loadedState.processedRows.get("test-row-123");
        expect(loadedRow).toBeDefined();
        expect(loadedRow?.rowId).toBe(row.rowId);
        expect(loadedRow?.timestamp).toBe(row.timestamp);
        expect(loadedRow?.success).toBe(row.success);
      }).pipe(Effect.provide(store.StateService.Default))
    );
  });
});
