import { ConfigProvider } from "effect";

/**
 * Shared test configuration interface used across all test files.
 */
export interface TestConfig {
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
    exclusionFilePath: string;
  };
  deployment: {
    flyRegion: string;
    discordWebhookUrl: string;
  };
}

/**
 * Creates a ConfigProvider from a TestConfig object.
 * Maps all config values to their corresponding environment variable names.
 */
export const createTestConfigProvider = (config: TestConfig) =>
  ConfigProvider.fromMap(
    new Map([
      ["GOOGLE_SHEET_ID", config.google.sheetId],
      ["GOOGLE_SERVICE_ACCOUNT_EMAIL", config.google.serviceAccountEmail],
      ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", config.google.serviceAccountPrivateKey],
      ["GOOGLE_PROJECT_ID", config.google.projectId],
      ["GROUPME_GROUP_ID", config.groupme.groupId],
      ["GROUPME_ACCESS_TOKEN", config.groupme.accessToken],
      ["COLUMN_NAME", config.sync.columnName],
      ["COLUMN_FIRST_NAME", config.sync.columnFirstName],
      ["COLUMN_LAST_NAME", config.sync.columnLastName],
      ["COLUMN_EMAIL", config.sync.columnEmail],
      ["COLUMN_PHONE", config.sync.columnPhone],
      ["DRY_RUN", config.sync.dryRun.toString()],
      ["EXCLUSION_FILE_PATH", config.sync.exclusionFilePath],
      ["FLY_REGION", config.deployment.flyRegion],
      ["DISCORD_WEBHOOK_URL", config.deployment.discordWebhookUrl],
    ])
  );

/**
 * Creates a default test configuration with sensible test values.
 */
export const createTestConfig = (): TestConfig => ({
  google: {
    sheetId: "test-sheet-id",
    serviceAccountEmail: "test@example.iam.gserviceaccount.com",
    serviceAccountPrivateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    projectId: "test-project",
  },
  groupme: {
    groupId: "test-group-id",
    accessToken: "test-token",
  },
  sync: {
    columnName: "Name",
    columnFirstName: "",
    columnLastName: "",
    columnEmail: "Email",
    columnPhone: "Phone",
    dryRun: false,
    exclusionFilePath: "test-exclude.json",
  },
  deployment: {
    flyRegion: "sfo",
    discordWebhookUrl: "https://discord.com/api/webhooks/test/token",
  },
});
