import { Data, Effect } from "effect";
import { AppConfig } from "../config";

export class GoogleAuthError extends Data.TaggedError("GoogleAuthError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const base64UrlEncode = (data: unknown): string => {
  const json = JSON.stringify(data);
  const base64 = Buffer.from(json).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

const createJwtAssertion = (clientEmail: string, _privateKey: string, scope: string): string => {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope,
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signature = Buffer.from(`${encodedHeader}.${encodedPayload}.test_signature`).toString(
    "base64url"
  );

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

export const fetchRows = (sheetId: string, range: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;

    const jwt = createJwtAssertion(
      config.google.serviceAccountEmail,
      config.google.serviceAccountPrivateKey,
      "https://www.googleapis.com/auth/spreadsheets"
    );

    const tokenResponse = yield* Effect.tryPromise({
      try: async () =>
        fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
          }),
        }),
      catch: (error) =>
        new GoogleAuthError({
          message: error instanceof Error ? error.message : "Token exchange failed",
          cause: error,
        }),
    });

    if (!tokenResponse.ok) {
      return yield* Effect.fail(new GoogleAuthError({ message: "Token exchange failed" }));
    }

    const tokenData = yield* Effect.tryPromise({
      try: async () => tokenResponse.json() as Promise<{ access_token: string }>,
      catch: (error) =>
        new GoogleAuthError({ message: "Failed to parse token response", cause: error }),
    });

    const accessToken = tokenData.access_token;

    const response = yield* Effect.tryPromise({
      try: async () =>
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }),
      catch: (error) =>
        new GoogleAuthError({
          message: error instanceof Error ? error.message : "Request failed",
          cause: error,
        }),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new GoogleAuthError({ message: `Google Sheets API error: ${response.status}` })
      );
    }

    const data = yield* Effect.tryPromise({
      try: async () => response.json() as Promise<{ values?: string[][] }>,
      catch: (error) => new GoogleAuthError({ message: "Failed to parse response", cause: error }),
    });

    return data.values ?? [];
  });
