import { describe, expect, it, vi } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import * as client from "./client";

interface TestConfig {
  google: {
    sheetId: string;
    serviceAccountEmail: string;
    serviceAccountPrivateKey: string;
    projectId: string;
  };
  groupme: { groupId: string; accessToken: string };
  sync: { columnName: string; columnEmail: string; columnPhone: string };
  deployment: { flyRegion: string; discordWebhookUrl: string };
}

const createTestConfigProvider = (config: TestConfig) =>
  ConfigProvider.fromMap(
    new Map([
      ["GOOGLE_SHEET_ID", config.google.sheetId],
      ["GOOGLE_SERVICE_ACCOUNT_EMAIL", config.google.serviceAccountEmail],
      ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", config.google.serviceAccountPrivateKey],
      ["GOOGLE_PROJECT_ID", config.google.projectId],
      ["GROUPME_GROUP_ID", config.groupme.groupId],
      ["GROUPME_ACCESS_TOKEN", config.groupme.accessToken],
      ["COLUMN_NAME", config.sync.columnName],
      ["COLUMN_EMAIL", config.sync.columnEmail],
      ["COLUMN_PHONE", config.sync.columnPhone],
      ["FLY_REGION", config.deployment.flyRegion],
      ["DISCORD_WEBHOOK_URL", config.deployment.discordWebhookUrl],
    ])
  );

const createTestConfig = (): TestConfig => ({
  google: {
    sheetId: "test-sheet-id",
    serviceAccountEmail: "test@example.iam.gserviceaccount.com",
    serviceAccountPrivateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    projectId: "test-project",
  },
  groupme: { groupId: "test-group-id", accessToken: "test-token" },
  sync: { columnName: "Name", columnEmail: "Email", columnPhone: "Phone" },
  deployment: {
    flyRegion: "sfo",
    discordWebhookUrl: "https://discord.com/api/webhooks/test/token",
  },
});

const testLayer = (config: TestConfig) => Layer.setConfigProvider(createTestConfigProvider(config));

describe("GroupMe API Client", () => {
  describe("addGroupMeMember", () => {
    it.effect("should successfully add a new member", () => {
      const testConfig = createTestConfig();
      const member: client.GroupMeMember = {
        nickname: "Test User",
        email: "test@example.com",
        phone_number: "+1234567890",
      };

      const mockResponse = {
        response: {
          results: [{ member_id: "12345", user_id: "67890" }],
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* client.addGroupMeMember("test-group-id", member);
          expect(result.success).toBe(true);
          expect(result.memberId).toBe("12345");
          expect(result.userId).toBe("67890");
          expect(result.alreadyExists).toBe(false);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should handle already_member response (409)", () => {
      const testConfig = createTestConfig();
      const member: client.GroupMeMember = {
        nickname: "Existing User",
      };

      const mockErrorResponse = {
        meta: { member_id: "12345" },
        message: "already_member",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => JSON.stringify(mockErrorResponse),
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* Effect.either(client.addGroupMeMember("test-group-id", member));
          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(client.GroupMeMemberAlreadyExistsError);
            const error = result.left as client.GroupMeMemberAlreadyExistsError;
            expect(error.message).toBe("Member already exists in group");
            expect(error.memberId).toBe("12345");
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should handle 401 unauthorized error", () => {
      const testConfig = createTestConfig();
      const member: client.GroupMeMember = {
        nickname: "Unauthorized User",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* Effect.either(client.addGroupMeMember("test-group-id", member));
          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(client.GroupMeUnauthorizedError);
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should handle generic API error", () => {
      const testConfig = createTestConfig();
      const member: client.GroupMeMember = {
        nickname: "Error User",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* Effect.either(client.addGroupMeMember("test-group-id", member));
          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(client.GroupMeApiError);
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should use default groupId from config when empty string provided", () => {
      const testConfig = createTestConfig();
      const member: client.GroupMeMember = {
        nickname: "Test User",
      };

      const mockResponse = {
        response: {
          results: [{ member_id: "12345", user_id: "67890" }],
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          yield* client.addGroupMeMember("", member); // Empty string triggers config default
          expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining("test-group-id"),
            expect.any(Object)
          );
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });
  });

  describe("getGroupMembers", () => {
    it.effect("should successfully fetch group members", () => {
      const testConfig = createTestConfig();

      const mockResponse = {
        response: {
          members: [
            { user_id: "1", nickname: "User 1", email: "user1@example.com" },
            { user_id: "2", nickname: "User 2", phone_number: "+1234567890" },
          ],
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const members = yield* client.getGroupMembers("test-group-id");
          expect(members).toHaveLength(2);
          expect(members[0].user_id).toBe("1");
          expect(members[0].nickname).toBe("User 1");
          expect(members[1].phone_number).toBe("+1234567890");
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should return empty array when no members", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const members = yield* client.getGroupMembers("test-group-id");
          expect(members).toHaveLength(0);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should handle 401 unauthorized error", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* Effect.either(client.getGroupMembers("test-group-id"));
          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(client.GroupMeUnauthorizedError);
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });
  });

  describe("validateGroupMeToken", () => {
    it.effect("should return user info on valid token", () => {
      const testConfig = createTestConfig();

      const mockResponse = {
        response: {
          id: "user123",
          name: "Test User",
          email: "test@example.com",
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* client.validateGroupMeToken;
          expect(result?.id).toBe("user123");
          expect(result?.name).toBe("Test User");
          expect(result?.email).toBe("test@example.com");
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should return GroupMeUnauthorizedError on 401", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* Effect.either(client.validateGroupMeToken);
          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(client.GroupMeUnauthorizedError);
            const error = result.left as client.GroupMeUnauthorizedError;
            expect(error.message).toBe("Invalid or expired GroupMe access token");
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });

    it.effect("should return GroupMeApiError on other failures", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Server Error",
      });

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const result = yield* Effect.either(client.validateGroupMeToken);
          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(client.GroupMeApiError);
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer(testConfig)));
    });
  });

  describe("error types", () => {
    it("should create GroupMeApiError with cause", () => {
      const cause = new Error("Network error");
      const error = new client.GroupMeApiError({ message: "Failed", cause, status: 500 });
      expect(error._tag).toBe("GroupMeApiError");
      expect(error.message).toBe("Failed");
      expect(error.cause).toBe(cause);
      expect(error.status).toBe(500);
    });

    it("should create GroupMeUnauthorizedError", () => {
      const error = new client.GroupMeUnauthorizedError({ message: "Token expired" });
      expect(error._tag).toBe("GroupMeUnauthorizedError");
      expect(error.message).toBe("Token expired");
    });

    it("should create GroupMeMemberAlreadyExistsError", () => {
      const error = new client.GroupMeMemberAlreadyExistsError({
        message: "Already a member",
        memberId: "12345",
      });
      expect(error._tag).toBe("GroupMeMemberAlreadyExistsError");
      expect(error.message).toBe("Already a member");
      expect(error.memberId).toBe("12345");
    });
  });
});
