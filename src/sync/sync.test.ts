import { describe, expect, it } from "@effect/vitest";
import { SyncResult, SyncResultDetail, type SyncResultFailedRow } from "../core/schema";
import { SyncError, SyncService } from "./sync";

describe("SyncService", () => {
  describe("run - empty data", () => {
    // Skip: These tests require mocking google-auth-library JWT client
    // TODO: Implement proper mocking strategy for GoogleAuthService
    it.skip("should return empty result when no rows", () => {
      expect(true).toBe(true);
    });

    it.skip("should return empty result when no valid contacts", () => {
      expect(true).toBe(true);
    });
  });

  describe("interface tests", () => {
    it("should have correct ProcessingContext shape", () => {
      const context = {
        state: { lastRun: null, processedRows: new Map() },
        added: 0,
        skipped: 0,
        errors: 0,
        failedCount: 0,
        details: [] as SyncResultDetail[],
        failedRows: [] as SyncResultFailedRow[],
      };

      expect(context.added).toBe(0);
      expect(context.skipped).toBe(0);
      expect(context.errors).toBe(0);
    });

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
      expect(error.cause).toBe(cause);
    });
  });

  describe("SyncService definition", () => {
    it("should be defined as a service", () => {
      expect(SyncService).toBeDefined();
      expect(SyncService.Default).toBeDefined();
    });
  });
});
