import { Effect } from "effect";
import { AppConfig } from "../config";

export interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp?: string;
  }>;
}

export class NotificationError extends Error {
  readonly _tag = "NotificationError";
}

interface NotifyService {
  notifyError: (error: unknown) => Effect.Effect<void, NotificationError>;
  notifySuccess: (summary: { added: number; skipped: number; errors: number }) => Effect.Effect<
    void,
    NotificationError
  >;
}

export const NotifyService = Effect.Service<NotifyService>()("NotifyService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig;

    const sendWebhook = (payload: DiscordWebhookPayload): Effect.Effect<void, NotificationError> =>
      Effect.tryPromise({
        try: async () => {
          const res = await fetch(config.deployment.discordWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            throw new Error(`Discord API error: ${res.status}`);
          }
        },
        catch: (e) =>
          new NotificationError(
            e instanceof Error ? e.message : "Failed to send Discord notification"
          ),
      });

    return {
      notifyError: (error: unknown): Effect.Effect<void, NotificationError> =>
        Effect.gen(function* () {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const timestamp = new Date().toISOString();

          const payload: DiscordWebhookPayload = {
            username: "Sheets to GroupMe",
            avatar_url: "https://i.imgur.com/AfFp7pu.png",
            embeds: [
              {
                title: "Sync Error",
                description: errorMessage,
                color: 0xff4444,
                fields: [{ name: "Time", value: timestamp, inline: true }],
                timestamp,
              },
            ],
          };

          yield* sendWebhook(payload);
          yield* Effect.logInfo("Error notification sent to Discord");
        }),

      notifySuccess: (summary: { added: number; skipped: number; errors: number }): Effect.Effect<
        void,
        NotificationError
      > =>
        Effect.gen(function* () {
          const timestamp = new Date().toISOString();
          const color = summary.errors > 0 ? 0xffaa00 : 0x44ff44;

          const payload: DiscordWebhookPayload = {
            username: "Sheets to GroupMe",
            avatar_url: "https://i.imgur.com/AfFp7pu.png",
            embeds: [
              {
                title: "Sync Complete",
                description: `Added ${summary.added}, skipped ${summary.skipped}, errors ${summary.errors}`,
                color,
                fields: [
                  { name: "Added", value: String(summary.added), inline: true },
                  { name: "Skipped", value: String(summary.skipped), inline: true },
                  { name: "Errors", value: String(summary.errors), inline: true },
                ],
                timestamp,
              },
            ],
          };

          yield* sendWebhook(payload);
          yield* Effect.logInfo("Success notification sent to Discord");
        }),
    };
  }),
  dependencies: [],
});
