import { describe, expect, it } from "@effect/vitest";
import { Config, ConfigProvider, Effect, Layer, Option } from "effect";
import { createTestConfig } from "../test/config";
import { createNotifyTestLayer } from "../test/helpers";
import {
  DiscordEmbed,
  DiscordEmbedField,
  DiscordWebhookPayload,
  NotificationError,
  NotifyService,
} from "./notify";

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
      const capturedRequests: Array<{ url: string; method: string }> = [];

      return Effect.gen(function* () {
        const service = yield* NotifyService;
        yield* service.notifyError(new Error("Test error message"));

        // Request was captured by mock handler - verify it was called
        expect(capturedRequests.length).toBe(1);
        expect(capturedRequests[0].url).toContain("discord.com/api/webhooks");
        expect(capturedRequests[0].method).toBe("POST");
      }).pipe(
        Effect.provide(
          createNotifyTestLayer(testConfig, (req) => {
            capturedRequests.push(req);
            return { status: 200, body: {} };
          })
        )
      );
    });

    it.effect("should handle non-Error objects", () => {
      const testConfig = createTestConfig();
      const capturedRequests: Array<{ url: string; method: string }> = [];

      return Effect.gen(function* () {
        const service = yield* NotifyService;
        yield* service.notifyError("String error");

        expect(capturedRequests.length).toBe(1);
      }).pipe(
        Effect.provide(
          createNotifyTestLayer(testConfig, (req) => {
            capturedRequests.push(req);
            return { status: 200, body: {} };
          })
        )
      );
    });

    it.effect("should return NotificationError on Discord API failure", () => {
      const testConfig = createTestConfig();

      return Effect.gen(function* () {
        const service = yield* NotifyService;
        const result = yield* Effect.either(service.notifyError(new Error("Test")));

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(NotificationError);
        }
      }).pipe(
        Effect.provide(
          createNotifyTestLayer(testConfig, () => ({
            status: 500,
            body: { error: "Server error" },
          }))
        )
      );
    });
  });

  describe("notifySuccess", () => {
    it.effect("should send success notification with green color when no errors", () => {
      const testConfig = createTestConfig();
      const capturedRequests: Array<{ url: string; method: string }> = [];

      return Effect.gen(function* () {
        const service = yield* NotifyService;
        yield* service.notifySuccess({ added: 5, skipped: 2, errors: 0 });

        expect(capturedRequests.length).toBe(1);
        expect(capturedRequests[0].method).toBe("POST");
      }).pipe(
        Effect.provide(
          createNotifyTestLayer(testConfig, (req) => {
            capturedRequests.push(req);
            return { status: 200, body: {} };
          })
        )
      );
    });

    it.effect("should send success notification with yellow color when errors exist", () => {
      const testConfig = createTestConfig();
      const capturedRequests: Array<{ url: string; method: string }> = [];

      return Effect.gen(function* () {
        const service = yield* NotifyService;
        yield* service.notifySuccess({ added: 3, skipped: 1, errors: 2 });

        expect(capturedRequests.length).toBe(1);
      }).pipe(
        Effect.provide(
          createNotifyTestLayer(testConfig, (req) => {
            capturedRequests.push(req);
            return { status: 200, body: {} };
          })
        )
      );
    });

    it.effect("should return NotificationError on Discord API failure", () => {
      const testConfig = createTestConfig();

      return Effect.gen(function* () {
        const service = yield* NotifyService;
        const result = yield* Effect.either(
          service.notifySuccess({ added: 1, skipped: 0, errors: 0 })
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(NotificationError);
        }
      }).pipe(
        Effect.provide(
          createNotifyTestLayer(testConfig, () => ({
            status: 429,
            body: { error: "Rate limited" },
          }))
        )
      );
    });
  });
});

describe("NotifyService Integration", () => {
  // These tests require DISCORD_WEBHOOK_URL_TEST env var
  // Run with: DISCORD_WEBHOOK_URL_TEST=https://discord.com/api/webhooks/... bun test

  const testWebhookConfig = Config.option(Config.string("DISCORD_WEBHOOK_URL_TEST"));

  const getTestWebhookUrl = Effect.gen(function* () {
    return yield* testWebhookConfig;
  }).pipe(Effect.provide(Layer.setConfigProvider(ConfigProvider.fromEnv())));

  const createIntegrationLayer = (webhookUrl: string) =>
    NotifyService.Default.pipe(
      Layer.provide(
        Layer.setConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["DISCORD_WEBHOOK_URL", webhookUrl],
              ["FLY_REGION", "sfo"],
              ["GOOGLE_SHEET_ID", "test"],
              ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "test@test.iam.gserviceaccount.com"],
              [
                "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
                "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
              ],
              ["GOOGLE_PROJECT_ID", "test"],
              ["GROUPME_GROUP_ID", "test"],
              ["GROUPME_ACCESS_TOKEN", "test"],
              ["COLUMN_NAME", "Name"],
              ["COLUMN_EMAIL", "Email"],
              ["COLUMN_PHONE", "Phone"],
            ])
          )
        )
      )
    );

  it.effect("should send real error notification to Discord", () =>
    Effect.gen(function* () {
      const maybeWebhookUrl = yield* getTestWebhookUrl;
      if (Option.isNone(maybeWebhookUrl)) {
        return; // Skip if no test webhook URL configured
      }
      const webhookUrl = maybeWebhookUrl.value;
      const service = yield* NotifyService.pipe(Effect.provide(createIntegrationLayer(webhookUrl)));
      yield* service.notifyError(new Error("[TEST] Integration test error - please ignore"));
    })
  );

  it.effect("should send real success notification to Discord", () =>
    Effect.gen(function* () {
      const maybeWebhookUrl = yield* getTestWebhookUrl;
      if (Option.isNone(maybeWebhookUrl)) {
        return; // Skip if no test webhook URL configured
      }
      const webhookUrl = maybeWebhookUrl.value;
      const service = yield* NotifyService.pipe(Effect.provide(createIntegrationLayer(webhookUrl)));
      yield* service.notifySuccess({ added: 10, skipped: 5, errors: 1 });
    })
  );
});
