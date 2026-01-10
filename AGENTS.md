# AGENTS.md - Sheets to GroupMe Integration

Guidance for AI coding agents. See also `CLAUDE.md` for commands and architecture overview.

## Pre-commit Checklist

```bash
bun run typecheck && bun run check
```

## Code Style

### Effect Service Pattern

Use `Effect.Service<T>()` class pattern for all services:

```typescript
export class MyService extends Effect.Service<MyService>()("MyService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig;
    const dep = yield* OtherService;  // Access dependencies during construction

    const doSomething = Effect.gen(function* () {
      // Method implementation
    });

    return { doSomething };
  }),
  dependencies: [OtherService.Default],  // Declare layer dependencies
}) {}
```

**Anti-patterns to avoid:**
- Factory functions (make pattern)
- Convenience wrapper functions that just call service methods
- Accessing services inside method bodies instead of during construction

### Error Pattern

Use `Data.TaggedError` for all errors:

```typescript
export class MyError extends Data.TaggedError("MyError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
```

### Schema Pattern

Use `Schema.Class` for data types:

```typescript
export class MyData extends Schema.Class<MyData>("MyData")({
  field: Schema.String,
  optional: Schema.optional(Schema.Number),
}) {}
```

### Imports

- Direct imports only - no barrel exports (index.ts files)
- Named imports from effect: `import { Effect, Data, Schema } from "effect"`

### Naming

| Construct | Convention | Example |
|-----------|------------|---------|
| Services | PascalCase + Service | `SyncService` |
| Errors | PascalCase + Error | `SyncError` |
| Schemas | PascalCase | `SyncResult` |
| Functions | camelCase | `fetchRows` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |

## Testing

Use `@effect/vitest` with `it.effect()`:

```typescript
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, ConfigProvider } from "effect";

const testLayer = MyService.Default.pipe(
  Layer.provide(Layer.setConfigProvider(ConfigProvider.fromMap(new Map([...]))))
);

it.effect("should work", () =>
  Effect.gen(function* () {
    const service = yield* MyService;
    const result = yield* service.doSomething;
    expect(result).toBeDefined();
  }).pipe(Effect.provide(testLayer))
);
```

## Environment Variables

All config via `Config.all` in `src/config.ts`. Document new vars in `.env.example`.

## Formatting (Biome)

- 2 space indent
- 100 char line width
- Double quotes
- Trailing commas (ES5)
