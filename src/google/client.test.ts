import { describe, expect, it, vi } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import {
  ColumnMappingError,
  GoogleAuthError,
  extractUserContacts,
  fetchRows,
  findColumnIndices,
  parseUserContacts,
} from "./client";

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
  groupme: { groupId: "test-group", accessToken: "test-token" },
  sync: { columnName: "Name", columnEmail: "Email", columnPhone: "Phone" },
  deployment: { flyRegion: "sfo", discordWebhookUrl: "https://discord.com/api/webhooks/test/token" },
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

    it("should create ColumnMappingError with column info", () => {
      const error = new ColumnMappingError({
        message: "Missing column",
        column: "Name",
      });
      expect(error._tag).toBe("ColumnMappingError");
      expect(error.message).toBe("Missing column");
      expect(error.column).toBe("Name");
    });
  });

  describe("findColumnIndices", () => {
    it("should find columns with exact match", () => {
      const headers = ["Name", "Email", "Phone", "Address"];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(0);
      expect(result.emailIndex).toBe(1);
      expect(result.phoneIndex).toBe(2);
    });

    it("should find columns with case-insensitive match", () => {
      const headers = ["NAME", "email", "PHONE"];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(0);
      expect(result.emailIndex).toBe(1);
      expect(result.phoneIndex).toBe(2);
    });

    it("should handle columns with extra whitespace", () => {
      const headers = ["  Name  ", "  Email  ", "  Phone  "];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(0);
      expect(result.emailIndex).toBe(1);
      expect(result.phoneIndex).toBe(2);
    });

    it("should return -1 for missing columns", () => {
      const headers = ["Name", "Address"];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(0);
      expect(result.emailIndex).toBe(-1);
      expect(result.phoneIndex).toBe(-1);
    });

    it("should return all -1 for empty headers", () => {
      const headers: string[] = [];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(-1);
      expect(result.emailIndex).toBe(-1);
      expect(result.phoneIndex).toBe(-1);
    });
  });

  describe("extractUserContacts", () => {
    it("should extract contacts from rows", () => {
      const rows = [
        ["John Doe", "john@example.com", "555-1234"],
        ["Jane Doe", "jane@example.com", "555-5678"],
      ];
      const mapping = { nameIndex: 0, emailIndex: 1, phoneIndex: 2 };

      const result = extractUserContacts(rows, mapping);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: "John Doe", email: "john@example.com", phone: "555-1234" });
      expect(result[1]).toEqual({ name: "Jane Doe", email: "jane@example.com", phone: "555-5678" });
    });

    it("should skip empty rows", () => {
      const rows = [
        ["John Doe", "john@example.com", "555-1234"],
        [],
        ["Jane Doe", "jane@example.com", "555-5678"],
      ];
      const mapping = { nameIndex: 0, emailIndex: 1, phoneIndex: 2 };

      const result = extractUserContacts(rows, mapping);

      expect(result).toHaveLength(2);
    });

    it("should handle missing optional fields", () => {
      const rows = [["John Doe"], ["Jane Doe", "jane@example.com"]];
      const mapping = { nameIndex: 0, emailIndex: 1, phoneIndex: 2 };

      const result = extractUserContacts(rows, mapping);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: "John Doe" });
      expect(result[1]).toEqual({ name: "Jane Doe", email: "jane@example.com" });
    });

    it("should trim whitespace from values", () => {
      const rows = [["  John Doe  ", "  john@example.com  ", "  555-1234  "]];
      const mapping = { nameIndex: 0, emailIndex: 1, phoneIndex: 2 };

      const result = extractUserContacts(rows, mapping);

      expect(result[0]).toEqual({ name: "John Doe", email: "john@example.com", phone: "555-1234" });
    });

    it("should handle empty optional fields", () => {
      const rows = [["John Doe", "", "+1234567890"]];
      const mapping = { nameIndex: 0, emailIndex: 1, phoneIndex: 2 };

      const result = extractUserContacts(rows, mapping);

      expect(result[0]).toEqual({ name: "John Doe", phone: "+1234567890" });
      expect(result[0].email).toBeUndefined();
    });

    it("should return empty array for no data rows", () => {
      const rows: string[][] = [];
      const mapping = { nameIndex: 0, emailIndex: 1, phoneIndex: 2 };

      const result = extractUserContacts(rows, mapping);

      expect(result).toHaveLength(0);
    });
  });

  describe("parseUserContacts", () => {
    it.effect("should parse valid contacts from rows", () => {
      const testConfig = createTestConfig();
      const rows = [
        ["Name", "Email", "Phone"],
        ["John Doe", "john@example.com", "555-1234"],
      ];

      return Effect.gen(function* () {
        const result = yield* parseUserContacts(rows, {
          name: "Name",
          email: "Email",
          phone: "Phone",
        });
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("John Doe");
        expect(result[0].email).toBe("john@example.com");
        expect(result[0].phone).toBe("555-1234");
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should return empty array for empty rows", () => {
      const testConfig = createTestConfig();
      const rows: string[][] = [];

      return Effect.gen(function* () {
        const result = yield* parseUserContacts(rows, {
          name: "Name",
          email: "Email",
          phone: "Phone",
        });
        expect(result).toEqual([]);
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should fail when name column is missing", () => {
      const testConfig = createTestConfig();
      const rows = [
        ["Email", "Phone"],
        ["john@example.com", "555-1234"],
      ];

      return Effect.gen(function* () {
        const result = yield* Effect.either(
          parseUserContacts(rows, { name: "Name", email: "Email", phone: "Phone" })
        );
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(ColumnMappingError);
          expect(result.left.column).toBe("Name");
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should fail when multiple columns are missing", () => {
      const testConfig = createTestConfig();
      const rows = [["Address"], ["123 Main St"]];

      return Effect.gen(function* () {
        const result = yield* Effect.either(
          parseUserContacts(rows, { name: "Name", email: "Email", phone: "Phone" })
        );
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(ColumnMappingError);
          // The first missing column should be reported
          expect(["Name", "Email", "Phone"]).toContain(result.left.column);
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should handle case-insensitive column matching", () => {
      const testConfig = createTestConfig();
      const rows = [
        ["NAME", "EMAIL", "PHONE"],
        ["John Doe", "john@example.com", "555-1234"],
      ];

      return Effect.gen(function* () {
        const result = yield* parseUserContacts(rows, {
          name: "Name",
          email: "Email",
          phone: "Phone",
        });
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("John Doe");
      }).pipe(Effect.provide(testLayer(testConfig)));
    });
  });
});
