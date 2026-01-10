import { describe, expect, it } from "@effect/vitest";
import {
  SyncResult,
  SyncResultDetail,
  SyncResultFailedRow,
  UserContact,
} from "../core/schema";
import { SyncError, SyncService } from "./sync";

interface ProcessedRow {
  rowId: string;
  timestamp: string;
  success: boolean;
}

interface SyncState {
  lastRun: string | null;
  processedRows: ReadonlyMap<string, ProcessedRow>;
}

interface ProcessingContext {
  state: SyncState;
  added: number;
  skipped: number;
  errors: number;
  failedCount: number;
  details: SyncResultDetail[];
  failedRows: SyncResultFailedRow[];
}

describe("Sync Processing Logic", () => {
  describe("ProcessingContext", () => {
    it("should have correct initial state shape", () => {
      const context: ProcessingContext = {
        state: { lastRun: null, processedRows: new Map() },
        added: 0,
        skipped: 0,
        errors: 0,
        failedCount: 0,
        details: [],
        failedRows: [],
      };

      expect(context.added).toBe(0);
      expect(context.skipped).toBe(0);
      expect(context.errors).toBe(0);
      expect(context.failedCount).toBe(0);
      expect(context.details).toHaveLength(0);
      expect(context.failedRows).toHaveLength(0);
    });

    it("should allow updating state while preserving other fields", () => {
      const initialContext: ProcessingContext = {
        state: { lastRun: null, processedRows: new Map() },
        added: 5,
        skipped: 2,
        errors: 1,
        failedCount: 1,
        details: [{ rowId: "r1", name: "A", status: "added", timestamp: "t1" }],
        failedRows: [{ rowId: "r2", contact: { name: "B" }, error: "err", timestamp: "t2" }],
      };

      const updatedState: SyncState = {
        lastRun: "2024-01-01T00:00:00.000Z",
        processedRows: new Map([["new-row", { rowId: "new-row", timestamp: "t3", success: true }]]),
      };

      const updatedContext: ProcessingContext = {
        ...initialContext,
        state: updatedState,
      };

      expect(updatedContext.added).toBe(5);
      expect(updatedContext.skipped).toBe(2);
      expect(updatedContext.errors).toBe(1);
      expect(updatedContext.state.lastRun).toBe("2024-01-01T00:00:00.000Z");
      expect(updatedContext.state.processedRows.size).toBe(1);
    });
  });

  describe("SyncResult interface", () => {
    it("should have correct shape for empty result", () => {
      const emptyResult: SyncResult = {
        added: 0,
        skipped: 0,
        errors: 0,
        duration: 100,
        details: [],
        failedRows: [],
      };

      expect(emptyResult.added).toBe(0);
      expect(emptyResult.skipped).toBe(0);
      expect(emptyResult.errors).toBe(0);
      expect(emptyResult.duration).toBe(100);
      expect(emptyResult.details).toHaveLength(0);
      expect(emptyResult.failedRows).toHaveLength(0);
    });

    it("should have correct shape for result with data", () => {
      const result: SyncResult = {
        added: 5,
        skipped: 2,
        errors: 1,
        duration: 1500,
        details: [
          { rowId: "r1", name: "A", status: "added", timestamp: "t1" },
          { rowId: "r2", name: "B", status: "skipped", error: "exists", timestamp: "t2" },
          { rowId: "r3", name: "C", status: "error", error: "Failed", timestamp: "t3" },
        ],
        failedRows: [
          {
            rowId: "r3",
            contact: { name: "C" },
            error: "Failed",
            timestamp: "t3",
          },
        ],
      };

      expect(result.added).toBe(5);
      expect(result.skipped).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.details).toHaveLength(3);
      expect(result.failedRows).toHaveLength(1);
    });

    it("should allow all status types", () => {
      const statuses: SyncResultDetail["status"][] = ["added", "skipped", "error", "failed"];

      for (const status of statuses) {
        const detail: SyncResultDetail = {
          rowId: "test",
          name: "Test",
          status,
        };
        expect(detail.status).toBe(status);
      }
    });

    it("should allow optional error and timestamp fields", () => {
      const detailWithoutOptional: SyncResultDetail = {
        rowId: "r1",
        name: "A",
        status: "added",
      };

      expect(detailWithoutOptional.error).toBeUndefined();
      expect(detailWithoutOptional.timestamp).toBeUndefined();

      const detailWithOptional: SyncResultDetail = {
        rowId: "r2",
        name: "B",
        status: "error",
        error: "Some error",
        timestamp: "2024-01-01T00:00:00.000Z",
      };

      expect(detailWithOptional.error).toBe("Some error");
      expect(detailWithOptional.timestamp).toBe("2024-01-01T00:00:00.000Z");
    });
  });

  describe("SyncState interface", () => {
    it("should have correct shape for empty state", () => {
      const emptyState: SyncState = {
        lastRun: null,
        processedRows: new Map(),
      };

      expect(emptyState.lastRun).toBeNull();
      expect(emptyState.processedRows.size).toBe(0);
    });

    it("should have correct shape for state with data", () => {
      const timestamp = "2024-01-01T00:00:00.000Z";
      const state: SyncState = {
        lastRun: timestamp,
        processedRows: new Map([
          ["row1", { rowId: "row1", timestamp, success: true }],
          ["row2", { rowId: "row2", timestamp, success: false }],
        ]),
      };

      expect(state.lastRun).toBe(timestamp);
      expect(state.processedRows.size).toBe(2);
      expect(state.processedRows.get("row1")?.success).toBe(true);
      expect(state.processedRows.get("row2")?.success).toBe(false);
    });

    it("should store processed rows in map", () => {
      const timestamp = "2024-01-01T00:00:00.000Z";
      const state: SyncState = {
        lastRun: timestamp,
        processedRows: new Map([
          ["row1", { rowId: "row1", timestamp, success: true }],
          ["row2", { rowId: "row2", timestamp, success: false }],
        ]),
      };

      expect(state.lastRun).toBe(timestamp);
      expect(state.processedRows.size).toBe(2);
      expect(state.processedRows.get("row1")?.success).toBe(true);
      expect(state.processedRows.get("row2")?.success).toBe(false);
    });
  });

  describe("ProcessedRow interface", () => {
    it("should have correct shape", () => {
      const row: ProcessedRow = {
        rowId: "abc123",
        timestamp: "2024-01-01T00:00:00.000Z",
        success: true,
      };

      expect(row.rowId).toBe("abc123");
      expect(row.timestamp).toBe("2024-01-01T00:00:00.000Z");
      expect(row.success).toBe(true);
    });

    it("should allow success to be false", () => {
      const row: ProcessedRow = {
        rowId: "abc123",
        timestamp: "2024-01-01T00:00:00.000Z",
        success: false,
      };

      expect(row.success).toBe(false);
    });
  });

  describe("UserContact interface", () => {
    it("should have correct shape with all fields", () => {
      const contact: UserContact = {
        name: "John Doe",
        email: "john@example.com",
        phone: "+1234567890",
      };

      expect(contact.name).toBe("John Doe");
      expect(contact.email).toBe("john@example.com");
      expect(contact.phone).toBe("+1234567890");
    });

    it("should allow minimal contact with only name", () => {
      const contact: UserContact = {
        name: "John Doe",
      };

      expect(contact.name).toBe("John Doe");
      expect(contact.email).toBeUndefined();
      expect(contact.phone).toBeUndefined();
    });

    it("should allow contact with name and email only", () => {
      const contact: UserContact = {
        name: "John Doe",
        email: "john@example.com",
      };

      expect(contact.email).toBe("john@example.com");
      expect(contact.phone).toBeUndefined();
    });
  });

  describe("SyncResultFailedRow interface", () => {
    it("should have correct shape", () => {
      const failedRow = new SyncResultFailedRow({
        rowId: "abc123",
        contact: new UserContact({ name: "John Doe", email: "john@example.com" }),
        error: "Already exists",
        timestamp: "2024-01-01T00:00:00.000Z",
      });

      expect(failedRow.rowId).toBe("abc123");
      expect(failedRow.contact.name).toBe("John Doe");
      expect(failedRow.error).toBe("Already exists");
      expect(failedRow.timestamp).toBe("2024-01-01T00:00:00.000Z");
    });
  });

  describe("SyncError", () => {
    it("should create SyncError with message", () => {
      const error = new SyncError({ message: "Sync failed" });
      expect(error._tag).toBe("SyncError");
      expect(error.message).toBe("Sync failed");
    });

    it("should create SyncError with message and cause", () => {
      const cause = new Error("Network error");
      const error = new SyncError({ message: "Sync failed", cause });
      expect(error._tag).toBe("SyncError");
      expect(error.message).toBe("Sync failed");
      expect(error.cause).toBe(cause);
    });
  });

  describe("SyncService", () => {
    it("should be defined as a service", () => {
      expect(SyncService).toBeDefined();
      expect(SyncService.Default).toBeDefined();
    });
  });

  describe("SyncResult schema class", () => {
    it("should create SyncResult with schema class", () => {
      const result = new SyncResult({
        added: 5,
        skipped: 2,
        errors: 1,
        duration: 1500,
        details: [
          new SyncResultDetail({ rowId: "r1", name: "A", status: "added", timestamp: "t1" }),
        ],
        failedRows: [],
      });

      expect(result.added).toBe(5);
      expect(result.skipped).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.duration).toBe(1500);
      expect(result.details).toHaveLength(1);
    });
  });
});
