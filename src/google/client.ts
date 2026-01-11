import { HttpClient, HttpClientRequest } from "@effect/platform";
import { NodeHttpClient } from "@effect/platform-node";
import { Data, Effect, Schema } from "effect";
import { JWT } from "google-auth-library";
import { AppConfig } from "../config";
import type { UserContact } from "../core/schema";

// Schema for Google Sheets API response
class GoogleSheetsResponse extends Schema.Class<GoogleSheetsResponse>("GoogleSheetsResponse")({
  values: Schema.optional(
    Schema.mutable(Schema.Array(Schema.mutable(Schema.Array(Schema.String))))
  ),
}) {}

export type { UserContact };

export class GoogleAuthError extends Data.TaggedError("GoogleAuthError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ColumnMappingError extends Data.TaggedError("ColumnMappingError")<{
  readonly message: string;
  readonly column: string;
}> {}

/**
 * GoogleAuthService - handles Google Service Account authentication using google-auth-library
 */
export class GoogleAuthService extends Effect.Service<GoogleAuthService>()("GoogleAuthService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig;

    const getAccessToken = () =>
      Effect.tryPromise({
        try: async () => {
          const client = new JWT({
            email: config.google.serviceAccountEmail,
            key: config.google.serviceAccountPrivateKey,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
          });
          const token = await client.getAccessToken();
          if (!token.token) {
            throw new Error("Failed to get access token");
          }
          return token.token;
        },
        catch: (error) =>
          new GoogleAuthError({
            message: error instanceof Error ? error.message : "Authentication failed",
            cause: error,
          }),
      });

    return { getAccessToken };
  }),
  dependencies: [],
}) {}

// Pure utility functions (no Effect needed)
export const findColumnIndices = (
  headers: string[],
  columnMapping: {
    name: string;
    email: string;
    phone: string;
  }
): { nameIndex: number; emailIndex: number; phoneIndex: number } => {
  const nameIndex = headers.findIndex(
    (h) => h.trim().toLowerCase() === columnMapping.name.toLowerCase()
  );
  const emailIndex = headers.findIndex(
    (h) => h.trim().toLowerCase() === columnMapping.email.toLowerCase()
  );
  const phoneIndex = headers.findIndex(
    (h) => h.trim().toLowerCase() === columnMapping.phone.toLowerCase()
  );

  return { nameIndex, emailIndex, phoneIndex };
};

export const extractUserContacts = (
  rows: string[][],
  columnMapping: { nameIndex: number; emailIndex: number; phoneIndex: number }
): UserContact[] => {
  return rows
    .filter((row) => row.length > 0)
    .map((row) => {
      const name = row[columnMapping.nameIndex]?.trim() ?? "";
      const email = row[columnMapping.emailIndex]?.trim();
      const phone = row[columnMapping.phoneIndex]?.trim();

      return {
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      } as UserContact;
    });
};

export class GoogleSheetsService extends Effect.Service<GoogleSheetsService>()(
  "GoogleSheetsService",
  {
    effect: Effect.gen(function* () {
      const authService = yield* GoogleAuthService;
      const baseClient = yield* HttpClient.HttpClient;

      const fetchRows = (sheetId: string, range: string) =>
        Effect.gen(function* () {
          const accessToken = yield* authService.getAccessToken();

          const httpClient = baseClient.pipe(
            HttpClient.filterStatusOk,
            HttpClient.mapRequest(
              HttpClientRequest.setHeaders({
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
              })
            )
          );

          const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
          const response = yield* httpClient.get(url).pipe(
            Effect.flatMap((res) => res.json),
            Effect.flatMap(Schema.decodeUnknown(GoogleSheetsResponse)),
            Effect.mapError(
              (error) =>
                new GoogleAuthError({
                  message: error.message,
                  cause: error,
                })
            )
          );

          return response.values ?? [];
        });

      const parseUserContacts = (
        rows: readonly string[][],
        columnMapping: {
          name: string;
          email: string;
          phone: string;
        }
      ): Effect.Effect<UserContact[], ColumnMappingError> => {
        if (rows.length === 0) {
          return Effect.succeed([]);
        }

        const headers = rows[0];
        const dataRows = rows.slice(1);

        const { nameIndex, emailIndex, phoneIndex } = findColumnIndices(headers, columnMapping);

        const missingColumns: string[] = [];
        if (nameIndex === -1) missingColumns.push(columnMapping.name);
        if (emailIndex === -1) missingColumns.push(columnMapping.email);
        if (phoneIndex === -1) missingColumns.push(columnMapping.phone);

        if (missingColumns.length > 0) {
          return Effect.fail(
            new ColumnMappingError({
              message: `Missing required columns: ${missingColumns.join(", ")}`,
              column: missingColumns[0],
            })
          );
        }

        return Effect.succeed(extractUserContacts(dataRows, { nameIndex, emailIndex, phoneIndex }));
      };

      return { fetchRows, parseUserContacts };
    }),
    dependencies: [GoogleAuthService.Default, NodeHttpClient.layerUndici],
  }
) {}
