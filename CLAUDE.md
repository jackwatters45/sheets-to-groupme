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
bun run test src/sync/sync.test.ts
```

## Architecture

Effect-TS application that syncs Google Sheets contacts to GroupMe groups on an hourly cron schedule.

### Services

All services use the `Effect.Service<T>()` class pattern with explicit dependencies:

- **SyncService** (`src/sync/sync.ts`) - Orchestrates sync, depends on StateService
- **StateService** (`src/state/store.ts`) - Persists processed rows to `data/state.json`
- **NotifyService** (`src/error/notify.ts`) - Discord webhook notifications

```typescript
export class SyncService extends Effect.Service<SyncService>()("SyncService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig;
    const stateService = yield* StateService;  // Access dependencies in construction
    return { run: Effect.gen(function* () { /* ... */ }) };
  }),
  dependencies: [StateService.Default],  // Declare layer dependencies
}) {}
```

**Key patterns:**
- Access dependencies during service construction, not inside methods
- Use `dependencies: []` array to compose layers automatically
- No convenience wrapper functions - access services directly via `yield* ServiceName`

### Data Flow

1. **Scheduler** (`src/scheduler/cron.ts`) - Uses `Schedule.cron("0 * * * *")` for hourly execution
2. **SyncService** - Fetches sheets data, processes contacts, tracks state
3. **Google Client** (`src/google/client.ts`) - Fetches rows using service account JWT auth
4. **GroupMe Client** (`src/groupme/client.ts`) - Adds members via REST API

### Effect Patterns

**Errors** - Tagged classes extending `Data.TaggedError`:
```typescript
export class SyncError extends Data.TaggedError("SyncError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
```

**Schemas** - Use `Schema.Class` pattern:
```typescript
export class SyncResult extends Schema.Class<SyncResult>("SyncResult")({
  added: Schema.Number,
  skipped: Schema.Number,
}) {}
```

**Config** - Via `Config.all` with environment bindings in `src/config.ts`

### Testing

Uses `@effect/vitest` with `it.effect()` for Effect-based tests. Test files are co-located (`*.test.ts`).

```typescript
it.effect("should work", () =>
  Effect.gen(function* () {
    const service = yield* SyncService;
    const result = yield* service.run;
    expect(result.added).toBe(0);
  }).pipe(Effect.provide(SyncService.Default))
);
```
