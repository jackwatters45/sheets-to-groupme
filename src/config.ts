import { Config, Effect } from "effect";

export interface AppConfig {
  googleSheetId: string;
  groupmeGroupId: string;
  columnName: string;
  columnEmail: string;
  columnPhone: string;
  flyRegion: string;
}

export const AppConfig = Config.all({
  googleSheetId: Config.string("GOOGLE_SHEET_ID"),
  groupmeGroupId: Config.string("GROUPME_GROUP_ID"),
  columnName: Config.string("COLUMN_NAME").pipe(Config.withDefault("Name")),
  columnEmail: Config.string("COLUMN_EMAIL").pipe(Config.withDefault("Email")),
  columnPhone: Config.string("COLUMN_PHONE").pipe(Config.withDefault("Phone")),
  flyRegion: Config.string("FLY_REGION").pipe(Config.withDefault("sfo")),
});

export const getConfig = Effect.map(AppConfig, (config) => config);
