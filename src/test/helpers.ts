import { HttpClient, HttpClientError, HttpClientResponse } from "@effect/platform";
import { Effect, Layer } from "effect";
import { NotifyService } from "../error/notify";
import { GoogleAuthService, GoogleSheetsService } from "../google/client";
import { GroupMeService } from "../groupme/client";
import type { ProcessedRow, SyncState } from "../state/store";
import { type TestConfig, createTestConfigProvider } from "./config";

/**
 * Mock response configuration for HttpClient tests.
 */
export interface MockHttpResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Request capture info for testing HTTP calls.
 */
export interface CapturedRequest {
  url: string;
  method: string;
  body?: unknown;
}

/**
 * Creates a request capture utility for testing HTTP calls.
 * Returns a tuple of [capturedRequests array, handler function].
 *
 * @example
 * const [requests, handler] = createRequestCapture({ status: 200, body: {} });
 * const layer = createNotifyTestLayer(config, handler);
 * // After test runs:
 * expect(requests).toHaveLength(1);
 * expect(requests[0].url).toContain('/api/webhooks');
 */
export const createRequestCapture = (
  response: MockHttpResponse = { status: 200, body: {} }
): [CapturedRequest[], (req: CapturedRequest) => MockHttpResponse] => {
  const capturedRequests: CapturedRequest[] = [];
  const handler = (req: CapturedRequest): MockHttpResponse => {
    capturedRequests.push(req);
    return response;
  };
  return [capturedRequests, handler];
};

/**
 * Creates a mock HttpClient that returns configured responses.
 * The handler function receives the request and returns the mock response.
 */
export const createMockHttpClient = (
  handler: (req: { url: string; method: string; body?: unknown }) => MockHttpResponse
) =>
  HttpClient.make((req) =>
    Effect.sync(() => {
      // Extract request info
      const url = req.url;
      const method = req.method;

      // Get the mock response from handler
      const mockResponse = handler({ url, method });

      const status = mockResponse.status ?? 200;
      const body = mockResponse.body;
      const headers = mockResponse.headers ?? { "Content-Type": "application/json" };

      // Create a Response object
      const responseBody = body !== undefined ? JSON.stringify(body) : "";
      const response = new Response(responseBody, {
        status,
        headers,
      });

      return HttpClientResponse.fromWeb(req, response);
    })
  );

/**
 * Creates a mock HttpClient that fails with a network-level error.
 * Useful for testing error handling when the HTTP request itself fails.
 */
export const createNetworkErrorHttpClient = (errorMessage: string) =>
  HttpClient.make((req) =>
    Effect.fail(
      new HttpClientError.RequestError({
        request: req,
        reason: "Transport",
        cause: new Error(errorMessage),
      })
    )
  );

/**
 * Creates a mock HttpClient layer that fails with a network error.
 */
export const createNetworkErrorHttpClientLayer = (errorMessage: string) =>
  Layer.succeed(HttpClient.HttpClient, createNetworkErrorHttpClient(errorMessage));

/**
 * Creates a mock HttpClient layer from a handler function.
 */
export const createMockHttpClientLayer = (
  handler: (req: { url: string; method: string; body?: unknown }) => MockHttpResponse
) => Layer.succeed(HttpClient.HttpClient, createMockHttpClient(handler));

/**
 * Creates a simple mock HttpClient layer that returns a fixed response.
 */
export const createSimpleMockHttpClientLayer = (response: MockHttpResponse) =>
  createMockHttpClientLayer(() => response);

/**
 * Creates a mock SyncState for testing.
 *
 * @param lastRun - The last run timestamp (null if never run)
 * @param processedRows - Map or Record of processed rows
 */
export const createMockState = (
  lastRun: string | null = null,
  processedRows?: Map<string, ProcessedRow> | Record<string, ProcessedRow>
): SyncState => ({
  lastRun,
  processedRows:
    processedRows instanceof Map ? processedRows : new Map(Object.entries(processedRows || {})),
});

/**
 * Creates a test layer for GoogleSheetsService with mock HttpClient.
 */
export const createGoogleTestLayer = (
  config: TestConfig,
  mockHandler?: (req: { url: string; method: string }) => MockHttpResponse
) => {
  const configLayer = Layer.setConfigProvider(createTestConfigProvider(config));
  const httpLayer = mockHandler
    ? createMockHttpClientLayer(mockHandler)
    : createSimpleMockHttpClientLayer({ status: 200, body: { values: [] } });

  return GoogleSheetsService.DefaultWithoutDependencies.pipe(
    Layer.provide(GoogleAuthService.Default),
    Layer.provide(httpLayer),
    Layer.provide(configLayer)
  );
};

/**
 * Creates a test layer for GroupMeService with mock HttpClient.
 */
export const createGroupMeTestLayer = (
  config: TestConfig,
  mockHandler?: (req: { url: string; method: string }) => MockHttpResponse
) => {
  const configLayer = Layer.setConfigProvider(createTestConfigProvider(config));
  const httpLayer = mockHandler
    ? createMockHttpClientLayer(mockHandler)
    : createSimpleMockHttpClientLayer({ status: 200, body: {} });

  return GroupMeService.DefaultWithoutDependencies.pipe(
    Layer.provide(httpLayer),
    Layer.provide(configLayer)
  );
};

/**
 * Creates a test layer for NotifyService with mock HttpClient.
 */
export const createNotifyTestLayer = (
  config: TestConfig,
  mockHandler?: (req: { url: string; method: string }) => MockHttpResponse
) => {
  const configLayer = Layer.setConfigProvider(createTestConfigProvider(config));
  const httpLayer = mockHandler
    ? createMockHttpClientLayer(mockHandler)
    : createSimpleMockHttpClientLayer({ status: 200, body: {} });

  return NotifyService.DefaultWithoutDependencies.pipe(
    Layer.provide(httpLayer),
    Layer.provide(configLayer)
  );
};

/**
 * Creates a test layer for NotifyService that simulates network failures.
 */
export const createNotifyNetworkErrorLayer = (config: TestConfig, errorMessage: string) => {
  const configLayer = Layer.setConfigProvider(createTestConfigProvider(config));
  const httpLayer = createNetworkErrorHttpClientLayer(errorMessage);

  return NotifyService.DefaultWithoutDependencies.pipe(
    Layer.provide(httpLayer),
    Layer.provide(configLayer)
  );
};
