import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createTestConfig } from "../test/config";
import { createGroupMeTestLayer } from "../test/helpers";
import {
  GroupMeApiError,
  type GroupMeMember,
  GroupMeMemberAlreadyExistsError,
  GroupMeService,
  GroupMeUnauthorizedError,
} from "./client";

describe("GroupMeService", () => {
  describe("addMember", () => {
    it.effect("should successfully add a new member", () => {
      const testConfig = createTestConfig();
      const member: GroupMeMember = {
        nickname: "Test User",
        email: "test@example.com",
        phone_number: "+1234567890",
      };

      const mockResponse = {
        response: {
          results: [{ member_id: "12345", user_id: "67890" }],
        },
      };

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const result = yield* service.addMember("test-group-id", member);
        expect(result.success).toBe(true);
        expect(result.memberId).toBe("12345");
        expect(result.userId).toBe("67890");
        expect(result.alreadyExists).toBe(false);
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 200,
            body: mockResponse,
          }))
        )
      );
    });

    it.effect("should handle already_member response (409)", () => {
      const testConfig = createTestConfig();
      const member: GroupMeMember = {
        nickname: "Existing User",
      };

      const mockErrorResponse = {
        meta: { member_id: "12345" },
        message: "already_member",
      };

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const result = yield* Effect.either(service.addMember("test-group-id", member));
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GroupMeMemberAlreadyExistsError);
          const error = result.left as GroupMeMemberAlreadyExistsError;
          expect(error.message).toBe("Member already exists in group");
          expect(error.memberId).toBe("12345");
        }
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 409,
            body: mockErrorResponse,
          }))
        )
      );
    });

    it.effect("should handle 401 unauthorized error", () => {
      const testConfig = createTestConfig();
      const member: GroupMeMember = {
        nickname: "Unauthorized User",
      };

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const result = yield* Effect.either(service.addMember("test-group-id", member));
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GroupMeUnauthorizedError);
        }
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 401,
            body: { error: "Unauthorized" },
          }))
        )
      );
    });

    it.effect("should handle generic API error", () => {
      const testConfig = createTestConfig();
      const member: GroupMeMember = {
        nickname: "Error User",
      };

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const result = yield* Effect.either(service.addMember("test-group-id", member));
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GroupMeApiError);
        }
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 500,
            body: { error: "Internal Server Error" },
          }))
        )
      );
    });

    it.effect("should use default groupId from config when empty string provided", () => {
      const testConfig = createTestConfig();
      const member: GroupMeMember = {
        nickname: "Test User",
      };

      const mockResponse = {
        response: {
          results: [{ member_id: "12345", user_id: "67890" }],
        },
      };

      const capturedRequests: Array<{ url: string; method: string }> = [];

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        yield* service.addMember("", member); // Empty string triggers config default
        expect(capturedRequests.length).toBe(1);
        expect(capturedRequests[0].url).toContain("test-group-id");
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, (req) => {
            capturedRequests.push(req);
            return { status: 200, body: mockResponse };
          })
        )
      );
    });
  });

  describe("getMembers", () => {
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

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const members = yield* service.getMembers("test-group-id");
        expect(members).toHaveLength(2);
        expect(members[0].user_id).toBe("1");
        expect(members[0].nickname).toBe("User 1");
        expect(members[1].phone_number).toBe("+1234567890");
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 200,
            body: mockResponse,
          }))
        )
      );
    });

    it.effect("should return empty array when no members", () => {
      const testConfig = createTestConfig();

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const members = yield* service.getMembers("test-group-id");
        expect(members).toHaveLength(0);
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 200,
            body: {},
          }))
        )
      );
    });

    it.effect("should handle 401 unauthorized error", () => {
      const testConfig = createTestConfig();

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const result = yield* Effect.either(service.getMembers("test-group-id"));
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GroupMeUnauthorizedError);
        }
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 401,
            body: { error: "Unauthorized" },
          }))
        )
      );
    });
  });

  describe("validateToken", () => {
    it.effect("should return user info on valid token", () => {
      const testConfig = createTestConfig();

      const mockResponse = {
        response: {
          id: "user123",
          name: "Test User",
          email: "test@example.com",
        },
      };

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const result = yield* service.validateToken;
        expect(result?.id).toBe("user123");
        expect(result?.name).toBe("Test User");
        expect(result?.email).toBe("test@example.com");
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 200,
            body: mockResponse,
          }))
        )
      );
    });

    it.effect("should return GroupMeUnauthorizedError on 401", () => {
      const testConfig = createTestConfig();

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const result = yield* Effect.either(service.validateToken);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GroupMeUnauthorizedError);
          const error = result.left as GroupMeUnauthorizedError;
          expect(error.message).toBe("Unauthorized - check GroupMe access token");
        }
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 401,
            body: { error: "Unauthorized" },
          }))
        )
      );
    });

    it.effect("should return GroupMeApiError on other failures", () => {
      const testConfig = createTestConfig();

      return Effect.gen(function* () {
        const service = yield* GroupMeService;
        const result = yield* Effect.either(service.validateToken);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GroupMeApiError);
        }
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 500,
            body: { error: "Server Error" },
          }))
        )
      );
    });
  });

  describe("error types", () => {
    it("should create GroupMeApiError with cause", () => {
      const cause = new Error("Network error");
      const error = new GroupMeApiError({ message: "Failed", cause, status: 500 });
      expect(error._tag).toBe("GroupMeApiError");
      expect(error.message).toBe("Failed");
      expect(error.cause).toBe(cause);
      expect(error.status).toBe(500);
    });

    it("should create GroupMeUnauthorizedError", () => {
      const error = new GroupMeUnauthorizedError({ message: "Token expired" });
      expect(error._tag).toBe("GroupMeUnauthorizedError");
      expect(error.message).toBe("Token expired");
    });

    it("should create GroupMeMemberAlreadyExistsError", () => {
      const error = new GroupMeMemberAlreadyExistsError({
        message: "Already a member",
        memberId: "12345",
      });
      expect(error._tag).toBe("GroupMeMemberAlreadyExistsError");
      expect(error.message).toBe("Already a member");
      expect(error.memberId).toBe("12345");
    });
  });

  describe("service definition", () => {
    it("should have GroupMeService defined", () => {
      expect(GroupMeService).toBeDefined();
      expect(GroupMeService.Default).toBeDefined();
    });
  });
});
