import { describe, expect, it, vi } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { GoogleAuthError, fetchRows } from "./client";

interface TestConfig {
  google: {
    sheetId: string;
    serviceAccountEmail: string;
    serviceAccountPrivateKey: string;
    projectId: string;
  };
  groupme: { groupId: string; accessToken: string };
  sync: { columnName: string; columnEmail: string; columnPhone: string };
  deployment: { flyRegion: string };
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
    ])
  );

const createTestConfig = (): TestConfig => ({
  google: {
    sheetId: "test-sheet-id",
    serviceAccountEmail: "test@example.iam.gserviceaccount.com",
    serviceAccountPrivateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    projectId: "test-project",
  },
  groupme: { groupId: "test-group", accessToken: "test-token" },
  sync: { columnName: "Name", columnEmail: "Email", columnPhone: "Phone" },
  deployment: { flyRegion: "sfo" },
});

const testLayer = (config: TestConfig) => Layer.setConfigProvider(createTestConfigProvider(config));

describe("GoogleSheetsClient", () => {
  describe("unit tests", () => {
    it("should have fetchRows function", () => {
      expect(typeof fetchRows).toBe("function");
    });

    it("should have GoogleAuthError defined", () => {
      expect(GoogleAuthError).toBeDefined();
    });

    it("should create tagged error instances", () => {
      const error = new GoogleAuthError({
        message: "Test error",
        cause: new Error("underlying"),
      });
      expect(error._tag).toBe("GoogleAuthError");
      expect(error.message).toBe("Test error");
    });
  });

  describe("integration tests", () => {
    it.effect("should fetch rows from Google Sheets", () => {
      const testConfig = createTestConfig();
      const mockValues = [
        ["Name", "Email", "Phone"],
        ["John Doe", "john@example.com", "555-1234"],
      ];

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "mock_token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ values: mockValues }),
        });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* fetchRows("test-sheet-id", "Sheet1!A1:C2");
          expect(result).toEqual(mockValues);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should return empty array when no values", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "mock_token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* fetchRows("test-sheet-id", "Sheet1!A1:C2");
          expect(result).toEqual([]);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should fail when token exchange fails", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        text: async () => "invalid_grant",
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* Effect.either(fetchRows("test-sheet-id", "Sheet1!A1:C2"));
          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(GoogleAuthError);
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should fail when Sheets API returns error", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "mock_token" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* Effect.either(fetchRows("test-sheet-id", "Sheet1!A1:C2"));
          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(GoogleAuthError);
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });
  });

  describe("error handling", () => {
    it("should create GoogleAuthError with cause", () => {
      const cause = new Error("Network error");
      const error = new GoogleAuthError({ message: "Failed", cause });
      expect(error._tag).toBe("GoogleAuthError");
      expect(error.cause).toBe(cause);
    });
  });
});
