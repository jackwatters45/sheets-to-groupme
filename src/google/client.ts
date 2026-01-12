import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { Data, Effect, Schema } from "effect";
import { JWT } from "google-auth-library";
import { AppConfig } from "../config";
import { UserContact } from "../core/schema";

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

export interface ColumnMapping {
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
}

export interface ColumnIndices {
  nameIndex: number;
  firstNameIndex: number;
  lastNameIndex: number;
  emailIndex: number;
  phoneIndex: number;
  useSeparateNames: boolean;
}

// Pure utility functions (no Effect needed)
export const findColumnIndices = (
  headers: string[],
  columnMapping: ColumnMapping
): ColumnIndices => {
  const findIndex = (columnName: string | undefined) =>
    columnName ? headers.findIndex((h) => h.trim().toLowerCase() === columnName.toLowerCase()) : -1;

  const nameIndex = findIndex(columnMapping.name);
  const firstNameIndex = findIndex(columnMapping.firstName);
  const lastNameIndex = findIndex(columnMapping.lastName);
  const emailIndex = findIndex(columnMapping.email);
  const phoneIndex = findIndex(columnMapping.phone);

  // Use separate names if firstName column is configured and found
  const useSeparateNames = !!columnMapping.firstName && firstNameIndex !== -1;

  return { nameIndex, firstNameIndex, lastNameIndex, emailIndex, phoneIndex, useSeparateNames };
};

/**
 * Combine first and last name into a full name.
 * Handles edge cases: empty last name, empty first name, whitespace.
 */
export const combineName = (firstName: string, lastName: string): string => {
  const first = firstName.trim();
  const last = lastName.trim();

  if (first && last) {
    return `${first} ${last}`;
  }
  if (first) {
    return first;
  }
  if (last) {
    return last;
  }
  return "";
};

export const extractUserContacts = (
  rows: string[][],
  columnIndices: ColumnIndices
): UserContact[] => {
  return rows
    .filter((row) => row.length > 0)
    .map((row) => {
      let name: string;

      if (columnIndices.useSeparateNames) {
        const firstName = row[columnIndices.firstNameIndex]?.trim() ?? "";
        const lastName = row[columnIndices.lastNameIndex]?.trim() ?? "";
        name = combineName(firstName, lastName);
      } else {
        name = row[columnIndices.nameIndex]?.trim() ?? "";
      }

      const email = row[columnIndices.emailIndex]?.trim();
      const phone = row[columnIndices.phoneIndex]?.trim();

      return { name, email, phone };
    })
    .filter((contact) => contact.name.length > 0)
    .map(
      (contact) =>
        new UserContact({
          name: contact.name,
          ...(contact.email ? { email: contact.email } : {}),
          ...(contact.phone ? { phone: contact.phone } : {}),
        })
    );
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
        columnMapping: ColumnMapping
      ): Effect.Effect<UserContact[], ColumnMappingError> => {
        if (rows.length === 0) {
          return Effect.succeed([]);
        }

        const headers = rows[0];
        const dataRows = rows.slice(1);

        const columnIndices = findColumnIndices(headers, columnMapping);

        const missingColumns: string[] = [];

        // If using separate first/last name columns, check those; otherwise check single name column
        if (columnIndices.useSeparateNames) {
          // Only firstName is required when using separate names
          if (columnIndices.firstNameIndex === -1 && columnMapping.firstName) {
            missingColumns.push(columnMapping.firstName);
          }
          // lastName is optional - don't require it
        } else {
          // Single name column mode
          if (columnIndices.nameIndex === -1) {
            missingColumns.push(columnMapping.name);
          }
        }

        // Email and phone are optional - don't fail if they're missing

        if (missingColumns.length > 0) {
          return Effect.fail(
            new ColumnMappingError({
              message: `Missing required columns: ${missingColumns.join(", ")}`,
              column: missingColumns[0],
            })
          );
        }

        return Effect.succeed(extractUserContacts(dataRows, columnIndices));
      };

      return { fetchRows, parseUserContacts };
    }),
    dependencies: [GoogleAuthService.Default, FetchHttpClient.layer],
  }
) {}
