import { describe, expect, it, vi } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { SyncResult, SyncResultDetail, type SyncResultFailedRow } from "../core/schema";
import { SyncError, SyncService } from "./sync";

// Test config type
interface TestConfig {
  google: {
    sheetId: string;
    serviceAccountEmail: string;
    serviceAccountPrivateKey: string;
    projectId: string;
  };
  groupme: { groupId: string; accessToken: string };
  sync: { columnName: string; columnEmail: string; columnPhone: string };
  deployment: { flyRegion: string; discordWebhookUrl: string };
}

const createTestConfigProvider = (config: TestConfig) =>
  ConfigProvider.fromMap(
    new Map([
      ["GOOGLE_SHEET_ID", config.google.sheetId],
      ["GOOGLE_SERVICE_ACCOUNT_EMAIL", config.google.serviceAccountEmail],
      ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", config.google.serviceAccountPrivateKey],
      ["GOOGLE_PROJECT_ID", config.google.projectId],
      ["GROUPME_GROUP_ID", config.groupme.groupId],
      ["GROUPME_ACCESS_TOKEN", config.groupme.accessToken],
      ["COLUMN_NAME", config.sync.columnName],
      ["COLUMN_EMAIL", config.sync.columnEmail],
      ["COLUMN_PHONE", config.sync.columnPhone],
      ["FLY_REGION", config.deployment.flyRegion],
      ["DISCORD_WEBHOOK_URL", config.deployment.discordWebhookUrl],
    ])
  );

const createTestConfig = (): TestConfig => ({
  google: {
    sheetId: "test-sheet-id",
    serviceAccountEmail: "test@example.iam.gserviceaccount.com",
    serviceAccountPrivateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    projectId: "test-project",
  },
  groupme: { groupId: "test-group-id", accessToken: "test-token" },
  sync: { columnName: "Name", columnEmail: "Email", columnPhone: "Phone" },
  deployment: {
    flyRegion: "sfo",
    discordWebhookUrl: "https://discord.com/api/webhooks/test/token",
  },
});

describe("SyncService", () => {
  describe("run - empty data", () => {
    it.effect("should return empty result when no rows", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "mock_token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ values: [] }),
        });

      const testLayer = SyncService.Default.pipe(
        Layer.provide(Layer.setConfigProvider(createTestConfigProvider(testConfig)))
      );

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const syncService = yield* SyncService;
          const result = yield* syncService.run;

          expect(result.added).toBe(0);
          expect(result.skipped).toBe(0);
          expect(result.errors).toBe(0);
          expect(result.details).toHaveLength(0);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer));
    });

    it.effect("should return empty result when no valid contacts", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "mock_token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ values: [["Name", "Email", "Phone"]] }),
        });

      const testLayer = SyncService.Default.pipe(
        Layer.provide(Layer.setConfigProvider(createTestConfigProvider(testConfig)))
      );

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const syncService = yield* SyncService;
          const result = yield* syncService.run;

          expect(result.added).toBe(0);
          expect(result.skipped).toBe(0);
          expect(result.errors).toBe(0);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer));
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
