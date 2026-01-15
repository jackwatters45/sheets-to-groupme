import { Config } from "effect";

export interface AppConfig {
  google: {
    sheetId: string;
    serviceAccountEmail: string;
    serviceAccountPrivateKey: string;
    projectId: string;
  };
  groupme: {
    groupId: string;
    accessToken: string;
  };
  sync: {
    columnName: string;
    columnFirstName: string;
    columnLastName: string;
    columnEmail: string;
    columnPhone: string;
    dryRun: boolean;
  };
  deployment: {
    flyRegion: string;
    discordWebhookUrl: string;
  };
}

export const AppConfig = Config.all({
  google: Config.all({
    sheetId: Config.string("GOOGLE_SHEET_ID"),
    serviceAccountEmail: Config.string("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    serviceAccountPrivateKey: Config.string("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").pipe(
      Config.map((key) => key.replace(/\\n/g, "\n"))
    ),
    projectId: Config.string("GOOGLE_PROJECT_ID"),
  }),
  groupme: Config.all({
    groupId: Config.string("GROUPME_GROUP_ID"),
    accessToken: Config.string("GROUPME_ACCESS_TOKEN"),
  }),
  sync: Config.all({
    columnName: Config.string("COLUMN_NAME").pipe(Config.withDefault("Name")),
    columnFirstName: Config.string("COLUMN_FIRST_NAME").pipe(Config.withDefault("")),
    columnLastName: Config.string("COLUMN_LAST_NAME").pipe(Config.withDefault("")),
    columnEmail: Config.string("COLUMN_EMAIL").pipe(Config.withDefault("Email")),
    columnPhone: Config.string("COLUMN_PHONE").pipe(Config.withDefault("Phone")),
    dryRun: Config.string("DRY_RUN").pipe(
      Config.map((v) => v.toLowerCase() === "true"),
      Config.withDefault(false)
    ),
  }),
  deployment: Config.all({
    flyRegion: Config.string("FLY_REGION").pipe(Config.withDefault("sfo")),
    discordWebhookUrl: Config.string("DISCORD_WEBHOOK_URL"),
  }),
});
