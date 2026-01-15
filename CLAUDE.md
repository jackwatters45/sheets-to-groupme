# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript project using Bun runtime, Effect framework for functional programming, and Google Sheets/GroupMe APIs. Deployed to Fly.io with hourly cron scheduling.

## Build, Lint, and Test Commands

```bash
# Type checking (REQUIRED before committing)
bun run typecheck          # Fast type check without emitting
bun run build              # Full TypeScript compilation

# Biome (format + lint + organize imports)
bun run format             # Auto-format all files
bun run lint               # Lint without fixing
bun run check              # Full biome check (format + lint + imports)

# Run the application
bun run src/main.ts        # Run main entry point

# Testing (IMPORTANT: use `bun run test`, NOT `bun test`)
bun run test               # Run vitest (correct way)
# Note: `bun test` uses Bun's native runner which has @effect/vitest compatibility issues
```

**Before committing, ALWAYS run:**

```bash
bun run typecheck && bun run check
```

## Code Style Guidelines

### General Principles

- Use Effect framework patterns (Effect, Layer, Context.Tag) for all effectful operations
- Avoid `any` type - use explicit types or `unknown` with validation
- No `@ts-ignore`, `@ts-expect-error`, or `as any`
- No empty catch blocks

### Imports and Dependencies

```typescript
// Correct - use named imports from effect
import { Effect, Layer, Context } from "effect";

// Correct - organize imports alphabetically
import { GoogleSheetsClient } from "./client";
import type { GoogleSheetsValueRange } from "./types";
```

### Effect Patterns

Use `Effect.Service` for services (preferred over manual make patterns):

```typescript
// Service definition with Effect.Service (PREFERRED)
export class GoogleSheetsClient extends Effect.Service<GoogleSheetsClient>()(
  "GoogleSheetsClient",
  {
    effect: Effect.gen(function* () {
      const config = yield* ConfigTag;

      return {
        fetchRows: (sheetId: string, range: string) =>
          Effect.tryPromise({
            try: async () => {
              const response = await fetch(...);
              return response.json();
            },
            catch: (error) => new GoogleSheetsError(...),
          }),
      };
    }),
    dependencies: [],
  }
) {}

// Use a single global ConfigTag for all app configuration
export class ConfigTag extends Context.Tag("AppConfig")<ConfigTag, AppConfig>() {}

// Provide config at the layer level
export const GoogleSheetsClientLive = Layer.succeed(ConfigTag, ConfigTag.of());
```

**Key patterns:**

- Use `Effect.Service` for all services (NOT factory functions)
- Use a single global `ConfigTag` for all environment configuration
- Inject config via `yield* ConfigTag` inside service implementations
- Use `Layer.succeed` to provide the config layer
- No barrel exports (`index.ts`) - export directly from each module
- DO NOT declare return types on Effect functions - let TypeScript infer them
- Use `yield* AppConfig` to access config directly (Config is built into Effect)
- Access dependencies during service construction, not inside methods

For services without dependencies:

```typescript
export class LoggerService extends Effect.Service<LoggerService>()(
  "LoggerService",
  {
    effect: Effect.succeed({
      log: (msg: string) => console.log(msg),
    }),
    dependencies: [],
  },
) {}
```

Avoid the "make pattern" with factory functions - use Effect.Service instead.

### Schema Patterns

Use `Schema.Class` for data types:

```typescript
import { Schema } from "effect";

export class SyncResult extends Schema.Class<SyncResult>("SyncResult")({
  added: Schema.Number,
  skipped: Schema.Number,
  errors: Schema.Number,
  details: Schema.Array(SyncResultDetail),
}) {}
```

### TypeScript Configuration

- Target: ES2022
- Module: ESNext with bundler resolution
- Strict mode enabled
- No unused locals or parameters

### Naming Conventions

| Construct           | Convention                     | Example              |
| ------------------- | ------------------------------ | -------------------- |
| Interfaces          | PascalCase                     | `GoogleSheetsClient` |
| Classes/Tags        | PascalCase                     | `GoogleSheetsError`  |
| Functions/variables | camelCase                      | `fetchRows`          |
| Constants           | SCREAMING_SNAKE_CASE           | `MAX_RETRIES`        |
| Error tags          | PascalCase with `Error` suffix | `GoogleSheetsError`  |

### Error Handling

Use `Data.TaggedError` for Effect errors:

```typescript
import { Data } from "effect";

export class GoogleSheetsError extends Data.TaggedError("GoogleSheetsError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// In Effect chain
Effect.tryPromise({
  try: async () => {
    /* API call */
  },
  catch: (error) =>
    new GoogleSheetsError({
      message: error instanceof Error ? error.message : "Unknown error",
      cause: error,
    }),
});
```

### Formatting (Biome)

- Indent: 2 spaces (not tabs)
- Line width: 100 characters
- Quote style: double quotes
- Trailing commas: ES5 compatible
- Organize imports enabled

### File Structure

```
src/
├── main.ts           # Entry point
├── config.ts         # Environment configuration
├── google/           # Google Sheets integration
│   └── client.ts     # API client with Layer
├── groupme/          # GroupMe integration
│   └── client.ts     # API client
├── state/            # Local state management
├── scheduler/        # Cron scheduling
├── error/            # Error handling and notifications
├── core/             # Shared utilities (schemas)
└── sync/             # Sync orchestration
```

### Module Patterns

Use direct imports - no barrel exports (`index.ts`):

```typescript
// Correct - import directly from source file
import { fetchRows } from "./google/client";
import { SyncResult } from "./core/schema";

// Avoid - no index.ts barrel files
// import { fetchRows } from "./google";
```

### Environment Variables

Use Effect Config for all environment access:

```typescript
import { Config } from "effect";

const config = Config.all({
  sheetId: Config.string("GOOGLE_SHEET_ID"),
  groupId: Config.string("GROUPME_GROUP_ID"),
}).pipe(Config.withDefault(defaults));
```

Secrets are managed via Infisical. Run locally with `infisical run -- bun run src/main.ts`.

### Testing (Vitest + @effect/vitest)

When adding tests:

```typescript
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";

it.effect("should work", () =>
  Effect.gen(function* () {
    const service = yield* SyncService;
    const result = yield* service.run;
    expect(result.added).toBe(0);
  }).pipe(Effect.provide(SyncService.Default)),
);
```

## Effect Framework Notes

- Use `Effect.gen` for complex Effect chains
- Use `Effect.tryPromise` for async operations with error conversion
- Use `Layer.succeed` for mock/static services
- Use `Layer.effect` for services requiring config/dependencies
- Provide layers via `Effect.provide` or `Layer.launch`

## Common Patterns

### HTTP Requests with @effect/platform

Use `@effect/platform` HttpClient (preferred over raw fetch):

```typescript
import { HttpClient, HttpClientRequest } from "@effect/platform";

const fetchData = (url: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(url);
    return yield* response.json;
  });
```

### Configuration with Defaults

```typescript
const appConfig = Config.all({
  value: Config.string("VALUE").pipe(Config.withDefault("default")),
});
```

## Sync Features

### Dry Run Mode

Set `DRY_RUN=true` to test sync without modifying GroupMe:

```bash
DRY_RUN=true infisical run -- bun run src/main.ts
```

- Contacts are not added to GroupMe
- Discord notifications are skipped
- Change detection hash is NOT updated (subsequent real sync still runs)
- Logs show: `[DRY RUN] Would add: Name (email, phone)`

### Exclusion List

Skip contacts already in GroupMe with different identifiers. Create `sync-exclude.json`:

```json
{
  "names": ["John Doe"],
  "emails": ["skip@example.com"],
  "phones": ["+15551234567"]
}
```

- Names/emails: case-insensitive
- Phones: normalized to digits only
- File is gitignored; see `sync-exclude.example.json` for template

### Change Detection

Sheet data is hashed (SHA-256) to detect changes. If hash matches previous sync, the sync is skipped. Hash is stored in memory and resets on app restart.

## Git Workflow

- Commit per feature: `feat(ID): description`
- Lefthook runs automatically:
  - **Pre-commit**: typecheck + `biome check --write` on staged files
  - **Pre-push**: typecheck, biome check, and tests
- Keep commits focused and atomic
