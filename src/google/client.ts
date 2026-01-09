import { Config, Context, Effect, Layer } from "effect";

export interface GoogleSheetsValueRange {
  range: string;
  majorDimension: "ROWS" | "COLUMNS";
  values: readonly string[][];
}

export class GoogleSheetsError extends Error {
  readonly _tag = "GoogleSheetsError";
}

export class GoogleAccessToken extends Context.Tag("GoogleAccessToken")<
  GoogleAccessToken,
  string
>() {}

export class GoogleSheetsClient extends Effect.Service<GoogleSheetsClient>()("GoogleSheetsClient", {
  effect: Effect.gen(function* () {
    const accessToken = yield* GoogleAccessToken;

    const fetchRows = (sheetId: string, range: string) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
              },
            }
          );

          if (!response.ok) {
            throw new Error(`Google Sheets API error: ${response.status}`);
          }

          const data = (await response.json()) as GoogleSheetsValueRange;
          return data.values ?? [];
        },
        catch: (error) =>
          new GoogleSheetsError(error instanceof Error ? error.message : "Unknown error"),
      });

    return { fetchRows };
  }),
  dependencies: [],
}) {}

export const GoogleSheetsClientLive = Layer.mergeAll(
  GoogleSheetsClient.Default,
  Layer.effect(GoogleAccessToken, Config.string("GOOGLE_ACCESS_TOKEN"))
);
