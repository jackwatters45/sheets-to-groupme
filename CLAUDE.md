# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run start         # Run the application (hourly sync scheduler)
bun run test          # Run tests in watch mode
bun run test --run    # Run tests once
bun run typecheck     # TypeScript type checking
bun run lint          # Run Biome linter
bun run check         # Run Biome check (lint + format validation)
bun run format        # Format code with Biome
```

Run a single test file:
```bash
bun run test src/google/client.test.ts
```

Run tests with coverage:
```bash
bun run test --run --coverage
```

## Architecture

This is an Effect-TS application that syncs Google Sheets contacts to GroupMe groups on an hourly schedule.

### Data Flow

1. **Scheduler** (`src/scheduler/cron.ts`) - Runs `runSync` every hour with graceful shutdown handling
2. **Sync** (`src/sync/sync.ts`) - Orchestrates the sync: fetches sheets data, processes contacts, tracks state
3. **Google Client** (`src/google/client.ts`) - Fetches rows from Google Sheets using service account JWT auth
4. **GroupMe Client** (`src/groupme/client.ts`) - Adds members to GroupMe groups via REST API
5. **State Store** (`src/state/store.ts`) - Persists processed rows to `data/state.json` to avoid duplicates

### Effect Patterns

- Uses `Effect.gen` generator syntax for effectful code
- Errors are tagged classes extending `Data.TaggedError` (e.g., `GoogleAuthError`, `GroupMeApiError`)
- Configuration via `Config.all` with environment variable bindings in `src/config.ts`
- Schemas defined with `Schema.Class` pattern in `src/core/schema.ts`
- Services use `Effect.Service` pattern (see `src/error/notify.ts`)

### Key Types

- `UserContact` - Contact parsed from sheet row (name, optional email/phone)
- `SyncState` - Tracks processed rows with SHA256 hash-based row IDs
- `SyncResult` - Sync operation outcome with added/skipped/error counts

### Testing

Tests use `@effect/vitest` with `Effect.gen` assertions. Test files are co-located with source files (`*.test.ts`).
