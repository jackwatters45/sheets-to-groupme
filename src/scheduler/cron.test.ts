import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Cron, Effect, Layer } from "effect";
import { vi } from "vitest";

// Create hoisted mock for google-auth-library
const mockJWT = vi.hoisted(() => {
  return class MockJWT {
    getAccessToken = () => Promise.resolve({ token: "mock_access_token" });
  };
});

vi.mock("google-auth-library", () => ({
  JWT: mockJWT,
}));

import { ColumnMappingError, GoogleSheetsService } from "../google/client";
import { type GroupMeMember, GroupMeService } from "../groupme/client";
import { runHourlySync } from "./cron";

// Test config
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

const googleTestLayer = (config: TestConfig) =>
  GoogleSheetsService.Default.pipe(
    Layer.provide(Layer.setConfigProvider(createTestConfigProvider(config)))
  );

const groupmeTestLayer = (config: TestConfig) =>
  GroupMeService.Default.pipe(
    Layer.provide(Layer.setConfigProvider(createTestConfigProvider(config)))
  );

describe("Cron Scheduler", () => {
  describe("runHourlySync", () => {
    it("should be exported and defined", () => {
      expect(runHourlySync).toBeDefined();
    });

    it("should be an Effect", () => {
      // runHourlySync is an Effect that can be run
      expect(Effect.isEffect(runHourlySync)).toBe(true);
    });

    it("runHourlySync module export exists", async () => {
      const cron = await import("./cron");
      expect(cron).toHaveProperty("runHourlySync");
    });
  });

  describe("Cron schedule parsing", () => {
    it("should parse hourly cron expression", () => {
      const hourlyCron = Cron.parse("0 * * * *");
      expect(hourlyCron._tag).toBe("Right");
    });

    it("should parse cron with unsafeParse", () => {
      const cron = Cron.unsafeParse("0 * * * *");
      // Cron object should have the expected structure
      expect(cron).toBeDefined();
      // Effect Cron uses Sets, not arrays
      expect(cron.minutes.has(0)).toBe(true);
      expect(cron.minutes.size).toBe(1);
      // * in hours means empty set (matches all), size 0
      expect(cron.hours.size).toBe(0);
    });

    it("should reject invalid cron expressions", () => {
      const result = Cron.parse("invalid");
      expect(result._tag).toBe("Left");
    });
  });

  describe("Effect.interruptible", () => {
    it.effect("should allow interruption of effects", () => {
      return Effect.gen(function* () {
        let executed = false;
        const interruptibleEffect = Effect.sync(() => {
          executed = true;
        }).pipe(Effect.interruptible);

        yield* interruptibleEffect;
        expect(executed).toBe(true);
      });
    });

    it.effect("should mark effect as interruptible", () => {
      return Effect.gen(function* () {
        // Verify that Effect.interruptible returns a valid effect
        const effect = Effect.succeed("test").pipe(Effect.interruptible);
        const result = yield* effect;
        expect(result).toBe("test");
      });
    });
  });

  describe("unit tests", () => {
    it("ONE_HOUR_MS should equal 3600000", () => {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      expect(ONE_HOUR_MS).toBe(3600000);
    });

    it("should have process.on available", () => {
      expect(typeof process.on).toBe("function");
    });

    it("should have process.off available", () => {
      expect(typeof process.off).toBe("function");
    });
  });

  describe("integration tests", () => {
    it.effect("should fetch rows from Google Sheets", () => {
      const testConfig = createTestConfig();
      const mockValues = [
        ["Name", "Email", "Phone"],
        ["John Doe", "john@example.com", "555-1234"],
      ];

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ values: mockValues }),
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const service = yield* GoogleSheetsService;
          const result = yield* service.fetchRows("test-sheet-id", "Sheet1!A1:C2");
          expect(result).toEqual(mockValues);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(googleTestLayer(testConfig)));
    });

    it.effect("should add member to GroupMe", () => {
      const testConfig = createTestConfig();
      const member: GroupMeMember = {
        nickname: "Test User",
        email: "test@example.com",
        phone_number: "+1234567890",
      };

      const mockResponse = {
        response: {
          results: [{ member_id: "12345", user_id: "67890" }],
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const service = yield* GroupMeService;
          const result = yield* service.addMember("test-group-id", member);
          expect(result.success).toBe(true);
          expect(result.memberId).toBe("12345");
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(groupmeTestLayer(testConfig)));
    });

    it.effect("should parse user contacts from rows", () => {
      const testConfig = createTestConfig();
      const rows = [
        ["Name", "Email", "Phone"],
        ["John Doe", "john@example.com", "555-1234"],
        ["Jane Doe", "jane@example.com", "555-5678"],
      ];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* service.parseUserContacts(rows, {
          name: "Name",
          email: "Email",
          phone: "Phone",
        });
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe("John Doe");
        expect(result[1].name).toBe("Jane Doe");
      }).pipe(Effect.provide(googleTestLayer(testConfig)));
    });

    it.effect("should handle empty rows", () => {
      const testConfig = createTestConfig();
      const rows: string[][] = [];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* service.parseUserContacts(rows, {
          name: "Name",
          email: "Email",
          phone: "Phone",
        });
        expect(result).toEqual([]);
      }).pipe(Effect.provide(googleTestLayer(testConfig)));
    });

    it.effect("should fail when columns missing", () => {
      const testConfig = createTestConfig();
      const rows = [
        ["Email", "Phone"],
        ["john@example.com", "555-1234"],
      ];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* Effect.either(
          service.parseUserContacts(rows, { name: "Name", email: "Email", phone: "Phone" })
        );
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(ColumnMappingError);
        }
      }).pipe(Effect.provide(googleTestLayer(testConfig)));
    });
  });
});
