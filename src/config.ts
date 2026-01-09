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
    columnEmail: string;
    columnPhone: string;
  };
  deployment: {
    flyRegion: string;
  };
}

export const AppConfig = Config.all({
  google: Config.all({
    sheetId: Config.string("GOOGLE_SHEET_ID"),
    serviceAccountEmail: Config.string("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    serviceAccountPrivateKey: Config.string("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
    projectId: Config.string("GOOGLE_PROJECT_ID"),
  }),
  groupme: Config.all({
    groupId: Config.string("GROUPME_GROUP_ID"),
    accessToken: Config.string("GROUPME_ACCESS_TOKEN"),
  }),
  sync: Config.all({
    columnName: Config.string("COLUMN_NAME").pipe(Config.withDefault("Name")),
    columnEmail: Config.string("COLUMN_EMAIL").pipe(Config.withDefault("Email")),
    columnPhone: Config.string("COLUMN_PHONE").pipe(Config.withDefault("Phone")),
  }),
  deployment: Config.all({
    flyRegion: Config.string("FLY_REGION").pipe(Config.withDefault("sfo")),
  }),
});
