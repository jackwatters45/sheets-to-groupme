import { describe, expect, it, vi } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import {
  DiscordEmbed,
  DiscordEmbedField,
  DiscordWebhookPayload,
  NotificationError,
  NotifyService,
} from "./notify";

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
  deployment: { flyRegion: "sfo", discordWebhookUrl: "https://discord.com/api/webhooks/test/token" },
});

const testLayer = (config: TestConfig) =>
  NotifyService.Default.pipe(
    Layer.provide(Layer.setConfigProvider(createTestConfigProvider(config)))
  );

describe("NotifyService", () => {
  describe("Schema classes", () => {
    it("should create DiscordEmbedField", () => {
      const field = new DiscordEmbedField({
        name: "Test Field",
        value: "Test Value",
        inline: true,
      });
      expect(field.name).toBe("Test Field");
      expect(field.value).toBe("Test Value");
      expect(field.inline).toBe(true);
    });

    it("should create DiscordEmbedField without inline", () => {
      const field = new DiscordEmbedField({
        name: "Test Field",
        value: "Test Value",
      });
      expect(field.name).toBe("Test Field");
      expect(field.inline).toBeUndefined();
    });

    it("should create DiscordEmbed with all fields", () => {
      const embed = new DiscordEmbed({
        title: "Test Title",
        description: "Test Description",
        color: 0xff0000,
        fields: [new DiscordEmbedField({ name: "Field", value: "Value" })],
        timestamp: "2024-01-01T00:00:00.000Z",
      });
      expect(embed.title).toBe("Test Title");
      expect(embed.description).toBe("Test Description");
      expect(embed.color).toBe(0xff0000);
      expect(embed.fields).toHaveLength(1);
      expect(embed.timestamp).toBe("2024-01-01T00:00:00.000Z");
    });

    it("should create DiscordEmbed with minimal fields", () => {
      const embed = new DiscordEmbed({});
      expect(embed.title).toBeUndefined();
      expect(embed.description).toBeUndefined();
    });

    it("should create DiscordWebhookPayload", () => {
      const payload = new DiscordWebhookPayload({
        content: "Test content",
        username: "Test Bot",
        avatar_url: "https://example.com/avatar.png",
        embeds: [new DiscordEmbed({ title: "Embed Title" })],
      });
      expect(payload.content).toBe("Test content");
      expect(payload.username).toBe("Test Bot");
      expect(payload.avatar_url).toBe("https://example.com/avatar.png");
      expect(payload.embeds).toHaveLength(1);
    });
  });

  describe("NotificationError", () => {
    it("should create NotificationError with message", () => {
      const error = new NotificationError({ message: "Failed to send" });
      expect(error._tag).toBe("NotificationError");
      expect(error.message).toBe("Failed to send");
    });

    it("should create NotificationError with message and cause", () => {
      const cause = new Error("Network error");
      const error = new NotificationError({ message: "Failed to send", cause });
      expect(error._tag).toBe("NotificationError");
      expect(error.message).toBe("Failed to send");
      expect(error.cause).toBe(cause);
    });
  });

  describe("notifyError", () => {
    it.effect("should send error notification to Discord", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const service = yield* NotifyService;
          yield* service.notifyError(new Error("Test error message"));

          expect(mockFetch).toHaveBeenCalledTimes(1);
          expect(mockFetch).toHaveBeenCalledWith(
            "https://discord.com/api/webhooks/test/token",
            expect.objectContaining({
              method: "POST",
              headers: { "Content-Type": "application/json" },
            })
          );

          const call = mockFetch.mock.calls[0];
          const body = JSON.parse(call[1].body);
          expect(body.username).toBe("Sheets to GroupMe");
          expect(body.embeds[0].title).toBe("Sync Error");
          expect(body.embeds[0].description).toBe("Test error message");
          expect(body.embeds[0].color).toBe(0xff4444);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should handle non-Error objects", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const service = yield* NotifyService;
          yield* service.notifyError("String error");

          const call = mockFetch.mock.calls[0];
          const body = JSON.parse(call[1].body);
          expect(body.embeds[0].description).toBe("String error");
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should return NotificationError on Discord API failure", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const service = yield* NotifyService;
          const result = yield* Effect.either(service.notifyError(new Error("Test")));

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(NotificationError);
            expect(result.left.message).toContain("Discord API error: 500");
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should return NotificationError on network failure", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const service = yield* NotifyService;
          const result = yield* Effect.either(service.notifyError(new Error("Test")));

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(NotificationError);
            expect(result.left.message).toBe("Network failure");
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });
  });

  describe("notifySuccess", () => {
    it.effect("should send success notification with green color when no errors", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const service = yield* NotifyService;
          yield* service.notifySuccess({ added: 5, skipped: 2, errors: 0 });

          expect(mockFetch).toHaveBeenCalledTimes(1);

          const call = mockFetch.mock.calls[0];
          const body = JSON.parse(call[1].body);
          expect(body.username).toBe("Sheets to GroupMe");
          expect(body.embeds[0].title).toBe("Sync Complete");
          expect(body.embeds[0].description).toBe("Added 5, skipped 2, errors 0");
          expect(body.embeds[0].color).toBe(0x44ff44); // Green
          expect(body.embeds[0].fields).toHaveLength(3);
          expect(body.embeds[0].fields[0].name).toBe("Added");
          expect(body.embeds[0].fields[0].value).toBe("5");
          expect(body.embeds[0].fields[1].name).toBe("Skipped");
          expect(body.embeds[0].fields[1].value).toBe("2");
          expect(body.embeds[0].fields[2].name).toBe("Errors");
          expect(body.embeds[0].fields[2].value).toBe("0");
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should send success notification with yellow color when errors exist", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const service = yield* NotifyService;
          yield* service.notifySuccess({ added: 3, skipped: 1, errors: 2 });

          const call = mockFetch.mock.calls[0];
          const body = JSON.parse(call[1].body);
          expect(body.embeds[0].color).toBe(0xffaa00); // Yellow/orange
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should return NotificationError on Discord API failure", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const service = yield* NotifyService;
          const result = yield* Effect.either(
            service.notifySuccess({ added: 1, skipped: 0, errors: 0 })
          );

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(NotificationError);
            expect(result.left.message).toContain("Discord API error: 429");
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });
  });
});

describe("NotifyService Integration", () => {
  // These tests require a real Discord webhook URL set in DISCORD_WEBHOOK_URL_TEST env var
  // Run with: DISCORD_WEBHOOK_URL_TEST=https://discord.com/api/webhooks/... npm test
  const testWebhookUrl = process.env["DISCORD_WEBHOOK_URL_TEST"];

  const integrationConfig = (): TestConfig => ({
    google: {
      sheetId: "test-sheet-id",
      serviceAccountEmail: "test@example.iam.gserviceaccount.com",
      serviceAccountPrivateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
      projectId: "test-project",
    },
    groupme: { groupId: "test-group-id", accessToken: "test-token" },
    sync: { columnName: "Name", columnEmail: "Email", columnPhone: "Phone" },
    deployment: { flyRegion: "sfo", discordWebhookUrl: testWebhookUrl || "" },
  });

  it.effect.skipIf(!testWebhookUrl)("should send real error notification to Discord", () => {
    return Effect.gen(function* () {
      const service = yield* NotifyService;
      yield* service.notifyError(new Error("[TEST] Integration test error - please ignore"));
    }).pipe(Effect.provide(testLayer(integrationConfig())));
  });

  it.effect.skipIf(!testWebhookUrl)("should send real success notification to Discord", () => {
    return Effect.gen(function* () {
      const service = yield* NotifyService;
      yield* service.notifySuccess({ added: 10, skipped: 5, errors: 1 });
    }).pipe(Effect.provide(testLayer(integrationConfig())));
  });
});
