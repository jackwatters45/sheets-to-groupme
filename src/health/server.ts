import { createServer } from "node:http";
import {
  FetchHttpClient,
  HttpClient,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Console, Data, Duration, Effect, Layer } from "effect";

/**
 * Error for readiness check failures
 */
export class ReadinessError extends Data.TaggedError("ReadinessError")<{
  readonly message: string;
}> {}

/**
 * GET /health - Simple liveness check
 */
const healthHandler = HttpServerResponse.json({ status: "ok" });

/**
 * GET /ready - Readiness check (verifies outbound connectivity to all services)
 */
const readyHandler = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;

  // Check Google Sheets API
  yield* client.head("https://sheets.googleapis.com").pipe(
    Effect.timeout(Duration.seconds(5)),
    Effect.mapError(() => new ReadinessError({ message: "Google Sheets API unreachable" }))
  );

  // Check GroupMe API
  yield* client.head("https://api.groupme.com").pipe(
    Effect.timeout(Duration.seconds(5)),
    Effect.mapError(() => new ReadinessError({ message: "GroupMe API unreachable" }))
  );

  // Check Discord API
  yield* client.head("https://discord.com").pipe(
    Effect.timeout(Duration.seconds(5)),
    Effect.mapError(() => new ReadinessError({ message: "Discord API unreachable" }))
  );

  return yield* HttpServerResponse.json({ status: "ready" });
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.json(
      { status: "not ready", error: "message" in error ? error.message : "Unknown error" },
      { status: 503 }
    )
  )
);

/**
 * Router with health endpoints
 */
const app = HttpRouter.empty.pipe(
  HttpRouter.get("/health", healthHandler),
  HttpRouter.get("/ready", readyHandler)
);

/**
 * Health server layer - serves on port 8080
 */
export const HealthServerLive = HttpServer.serve(app).pipe(
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port: 8080 })),
  Layer.provide(FetchHttpClient.layer)
);

/**
 * Wait for network to be ready by polling /ready endpoint
 */
export const waitForNetwork = Effect.gen(function* () {
  yield* Console.log("[INFO] Checking network readiness...");
  const client = yield* HttpClient.HttpClient;
  const maxAttempts = 30; // 30 attempts * 2s = 60s max wait

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isReady = yield* client.get("http://localhost:8080/ready").pipe(
      Effect.flatMap((res) => Effect.succeed(res.status === 200)),
      Effect.catchAll(() => Effect.succeed(false))
    );

    if (isReady) {
      yield* Console.log(
        `[INFO] All services reachable after ${attempt * 2}s, waiting 45s for API backends...`
      );
      yield* Effect.sleep(Duration.seconds(45));
      yield* Console.log("[INFO] Network stabilized, proceeding");
      return;
    }

    yield* Effect.sleep(Duration.seconds(2));
  }

  yield* Console.warn("[WARN] Network readiness check timed out after 60s, proceeding anyway");
}).pipe(Effect.provide(FetchHttpClient.layer));
