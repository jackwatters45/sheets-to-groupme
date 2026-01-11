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
  GroupMember,
  isContactInGroup,
  matchesByEmail,
  matchesByName,
  matchesByPhone,
  normalizePhone,
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

describe("normalizePhone", () => {
  it("should strip non-digit characters", () => {
    expect(normalizePhone("+1-555-123-4567")).toBe("15551234567");
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("+44 20 7946 0958")).toBe("442079460958");
  });

  it("should handle already normalized phones", () => {
    expect(normalizePhone("15551234567")).toBe("15551234567");
    expect(normalizePhone("5551234567")).toBe("5551234567");
  });

  it("should handle empty string", () => {
    expect(normalizePhone("")).toBe("");
  });

  it("should handle phones with extensions", () => {
    expect(normalizePhone("+1-555-123-4567 ext 123")).toBe("15551234567123");
  });

  it("should handle international formats", () => {
    expect(normalizePhone("+81-3-1234-5678")).toBe("81312345678");
    expect(normalizePhone("+49 30 12345678")).toBe("493012345678");
  });
});

describe("matchesByName", () => {
  it("should match case-insensitively", () => {
    expect(matchesByName("John Doe", "John Doe")).toBe(true);
    expect(matchesByName("john doe", "JOHN DOE")).toBe(true);
    expect(matchesByName("JANE", "jane")).toBe(true);
  });

  it("should not match different names", () => {
    expect(matchesByName("John", "Jane")).toBe(false);
    expect(matchesByName("John Doe", "John Smith")).toBe(false);
  });

  it("should return false for undefined values", () => {
    expect(matchesByName(undefined, "John")).toBe(false);
    expect(matchesByName("John", undefined)).toBe(false);
    expect(matchesByName(undefined, undefined)).toBe(false);
  });
});

describe("matchesByEmail", () => {
  it("should match case-insensitively", () => {
    expect(matchesByEmail("john@example.com", "john@example.com")).toBe(true);
    expect(matchesByEmail("JOHN@EXAMPLE.COM", "john@example.com")).toBe(true);
    expect(matchesByEmail("John@Example.Com", "JOHN@EXAMPLE.COM")).toBe(true);
  });

  it("should not match different emails", () => {
    expect(matchesByEmail("john@example.com", "jane@example.com")).toBe(false);
  });

  it("should return false for undefined values", () => {
    expect(matchesByEmail(undefined, "john@example.com")).toBe(false);
    expect(matchesByEmail("john@example.com", undefined)).toBe(false);
    expect(matchesByEmail(undefined, undefined)).toBe(false);
  });
});

describe("matchesByPhone", () => {
  it("should match normalized phones", () => {
    expect(matchesByPhone("15551234567", "15551234567")).toBe(true);
    expect(matchesByPhone("+1-555-123-4567", "15551234567")).toBe(true);
    expect(matchesByPhone("(555) 123-4567", "+1 555 123 4567")).toBe(false); // different digit count
  });

  it("should not match different phones", () => {
    expect(matchesByPhone("15551234567", "15559999999")).toBe(false);
  });

  it("should return false for undefined values", () => {
    expect(matchesByPhone(undefined, "15551234567")).toBe(false);
    expect(matchesByPhone("15551234567", undefined)).toBe(false);
    expect(matchesByPhone(undefined, undefined)).toBe(false);
  });
});

describe("isContactInGroup", () => {
  const members = [
    new GroupMember({ user_id: "1", nickname: "John Doe", email: "john@example.com" }),
    new GroupMember({ user_id: "2", nickname: "Jane Smith", phone_number: "15551234567" }),
    new GroupMember({ user_id: "3", nickname: "Bob" }),
  ];

  describe("name matching", () => {
    it("should match by exact name (case-insensitive)", () => {
      expect(isContactInGroup({ name: "John Doe" }, members)).toBe(true);
      expect(isContactInGroup({ name: "john doe" }, members)).toBe(true);
      expect(isContactInGroup({ name: "JANE SMITH" }, members)).toBe(true);
    });

    it("should not match partial names", () => {
      expect(isContactInGroup({ name: "John" }, members)).toBe(false);
      expect(isContactInGroup({ name: "Jane" }, members)).toBe(false);
    });

    it("should not match unknown names", () => {
      expect(isContactInGroup({ name: "Unknown Person" }, members)).toBe(false);
    });
  });

  describe("email matching", () => {
    it("should match by email (case-insensitive)", () => {
      expect(isContactInGroup({ email: "john@example.com" }, members)).toBe(true);
      expect(isContactInGroup({ email: "JOHN@EXAMPLE.COM" }, members)).toBe(true);
    });

    it("should not match unknown emails", () => {
      expect(isContactInGroup({ email: "unknown@example.com" }, members)).toBe(false);
    });
  });

  describe("phone matching", () => {
    it("should match by normalized phone", () => {
      expect(isContactInGroup({ phone: "15551234567" }, members)).toBe(true);
      expect(isContactInGroup({ phone: "+1-555-123-4567" }, members)).toBe(true);
      expect(isContactInGroup({ phone: "(555) 123-4567" }, members)).toBe(false); // missing country code
    });

    it("should not match unknown phones", () => {
      expect(isContactInGroup({ phone: "9999999999" }, members)).toBe(false);
    });
  });

  describe("combined matching", () => {
    it("should match if any field matches", () => {
      expect(isContactInGroup({ name: "Wrong", email: "john@example.com" }, members)).toBe(true);
      expect(isContactInGroup({ name: "Jane Smith", email: "wrong@example.com" }, members)).toBe(
        true
      );
    });

    it("should not match if no fields match", () => {
      expect(
        isContactInGroup(
          { name: "Unknown", email: "unknown@example.com", phone: "0000000000" },
          members
        )
      ).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle empty members array", () => {
      expect(isContactInGroup({ name: "John Doe" }, [])).toBe(false);
    });

    it("should handle contact with no matching fields", () => {
      expect(isContactInGroup({}, members)).toBe(false);
    });

    it("should handle undefined fields", () => {
      expect(
        isContactInGroup({ name: undefined, email: undefined, phone: undefined }, members)
      ).toBe(false);
    });
  });
});
