import { createServer } from "node:http";
import { HttpClient, HttpRouter, HttpServer, HttpServerResponse } from "@effect/platform";
import { NodeHttpClient, NodeHttpServer } from "@effect/platform-node";
import { Console, Duration, Effect, Layer } from "effect";

/**
 * Health check - verifies connectivity to Google Sheets API
 */
export const checkHealth = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  yield* client.head("https://sheets.googleapis.com").pipe(
    Effect.timeout(Duration.seconds(2)),
    Effect.mapError(() => new Error("Google Sheets API unreachable"))
  );
  return { status: "healthy" as const };
});

/**
 * Health endpoint handler
 */
const healthHandler = checkHealth.pipe(
  Effect.matchEffect({
    onSuccess: (health) => HttpServerResponse.json(health),
    onFailure: (error) =>
      HttpServerResponse.json({ status: "unhealthy", error: error.message }, { status: 503 }),
  })
);

/**
 * Health endpoint router
 */
const healthApp = HttpRouter.empty.pipe(HttpRouter.get("/health", healthHandler));

/**
 * Health server layer - serves health endpoint on port 8080
 */
export const HealthServerLive = HttpServer.serve(healthApp).pipe(
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port: 8080 })),
  Layer.provide(NodeHttpClient.layerUndici)
);

/**
 * Wait for network to be ready by polling health check
 */
export const waitForNetwork = Effect.gen(function* () {
  yield* Console.log("[INFO] Checking network readiness...");
  const maxAttempts = 30; // 30 attempts * 2s = 60s max wait

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isReady = yield* checkHealth.pipe(
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false))
    );

    if (isReady) {
      yield* Console.log(`[INFO] Network ready after ${attempt * 2}s`);
      return;
    }

    yield* Effect.sleep(Duration.seconds(2));
  }

  yield* Console.warn("[WARN] Network readiness check timed out after 60s, proceeding anyway");
}).pipe(Effect.provide(NodeHttpClient.layerUndici));
