import { FetchHttpClient, HttpBody, HttpClient } from "@effect/platform";
import { Data, Effect, Schema } from "effect";
import { AppConfig } from "../config";

// Schema definitions for Discord webhook payload
export class DiscordEmbedField extends Schema.Class<DiscordEmbedField>("DiscordEmbedField")({
  name: Schema.String,
  value: Schema.String,
  inline: Schema.optional(Schema.Boolean),
}) {}

export class DiscordEmbed extends Schema.Class<DiscordEmbed>("DiscordEmbed")({
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  color: Schema.optional(Schema.Number),
  fields: Schema.optional(Schema.Array(DiscordEmbedField)),
  timestamp: Schema.optional(Schema.String),
}) {}

export class DiscordWebhookPayload extends Schema.Class<DiscordWebhookPayload>(
  "DiscordWebhookPayload"
)({
  content: Schema.optional(Schema.String),
  username: Schema.optional(Schema.String),
  avatar_url: Schema.optional(Schema.String),
  embeds: Schema.optional(Schema.Array(DiscordEmbed)),
}) {}

// Error definition using Data.TaggedError
export class NotificationError extends Data.TaggedError("NotificationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// Notification service
export class NotifyService extends Effect.Service<NotifyService>()("NotifyService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig;
    const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

    const sendWebhook = (payload: DiscordWebhookPayload): Effect.Effect<void, NotificationError> =>
      httpClient
        .post(config.deployment.discordWebhookUrl, {
          body: HttpBody.unsafeJson(payload),
        })
        .pipe(
          Effect.asVoid,
          Effect.mapError(
            (e) =>
              new NotificationError({
                message: e.message,
                cause: e,
              })
          )
        );

    return {
      notifyError: (error: unknown): Effect.Effect<void, NotificationError> =>
        Effect.gen(function* () {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const timestamp = new Date().toISOString();

          const payload = new DiscordWebhookPayload({
            username: "Sheets to GroupMe",
            avatar_url: "https://i.imgur.com/AfFp7pu.png",
            embeds: [
              new DiscordEmbed({
                title: "Sync Error",
                description: errorMessage,
                color: 0xff4444,
                fields: [new DiscordEmbedField({ name: "Time", value: timestamp, inline: true })],
                timestamp,
              }),
            ],
          });

          yield* sendWebhook(payload);
          yield* Effect.logInfo("Error notification sent to Discord");
        }),

      notifySuccess: (summary: {
        added: number;
        skipped: number;
        errors: number;
      }): Effect.Effect<void, NotificationError> =>
        Effect.gen(function* () {
          const timestamp = new Date().toISOString();
          const color = summary.errors > 0 ? 0xffaa00 : 0x44ff44;

          const payload = new DiscordWebhookPayload({
            username: "Sheets to GroupMe",
            avatar_url: "https://i.imgur.com/AfFp7pu.png",
            embeds: [
              new DiscordEmbed({
                title: "Sync Complete",
                description: `Added ${summary.added}, skipped ${summary.skipped}, errors ${summary.errors}`,
                color,
                fields: [
                  new DiscordEmbedField({
                    name: "Added",
                    value: String(summary.added),
                    inline: true,
                  }),
                  new DiscordEmbedField({
                    name: "Skipped",
                    value: String(summary.skipped),
                    inline: true,
                  }),
                  new DiscordEmbedField({
                    name: "Errors",
                    value: String(summary.errors),
                    inline: true,
                  }),
                ],
                timestamp,
              }),
            ],
          });

          yield* sendWebhook(payload);
          yield* Effect.logInfo("Success notification sent to Discord");
        }),
    };
  }),
  dependencies: [FetchHttpClient.layer],
}) {}
