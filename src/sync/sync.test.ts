import { beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  SyncResult,
  SyncResultDetail,
  type SyncResultFailedRow,
  UserContact,
} from "../core/schema";
import { GoogleSheetsService } from "../google/client";
import { GroupMeApiError, GroupMeService, GroupMember } from "../groupme/client";
import { createTestConfig, createTestConfigProvider } from "../test/config";
import { SyncError, SyncService, computeSheetHash, resetSheetHash } from "./sync";

describe("computeSheetHash", () => {
  it("should compute consistent hash for same data", () => {
    const rows = [
      ["Name", "Email"],
      ["John", "john@example.com"],
    ];
    const hash1 = computeSheetHash(rows);
    const hash2 = computeSheetHash(rows);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hash for different data", () => {
    const rows1 = [["Name"], ["John"]];
    const rows2 = [["Name"], ["Jane"]];
    const hash1 = computeSheetHash(rows1);
    const hash2 = computeSheetHash(rows2);
    expect(hash1).not.toBe(hash2);
  });

  it("should produce same hash regardless of row order", () => {
    const rows1 = [["Name"], ["Alice"], ["Bob"]];
    const rows2 = [["Name"], ["Bob"], ["Alice"]];
    const hash1 = computeSheetHash(rows1);
    const hash2 = computeSheetHash(rows2);
    expect(hash1).toBe(hash2);
  });

  it("should handle empty rows", () => {
    const hash = computeSheetHash([]);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64); // SHA-256 hex string length
  });
});

describe("SyncService", () => {
  // Reset the stored hash before each test to ensure isolation
  beforeEach(() => {
    resetSheetHash();
  });

  describe("run - empty data", () => {
    const testConfig = createTestConfig();
    const configProviderLayer = Layer.setConfigProvider(createTestConfigProvider(testConfig));

    it.effect("should return empty result when no rows", () =>
      Effect.gen(function* () {
        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () => Effect.succeed([]),
          parseUserContacts: () => Effect.succeed([]),
        });

        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.succeed({
              success: true,
              memberId: "12345",
              userId: "u12345",
              alreadyExists: false,
            }),
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        expect(result.added).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toBe(0);
        expect(result.details).toHaveLength(0);
      })
    );

    it.effect("should return empty result when no valid contacts", () =>
      Effect.gen(function* () {
        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () => Effect.succeed([["Name", "Email", "Phone"]]),
          parseUserContacts: () => Effect.succeed([]),
        });

        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.succeed({
              success: true,
              memberId: "12345",
              userId: "u12345",
              alreadyExists: false,
            }),
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        expect(result.added).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toBe(0);
      })
    );
  });

  describe("interface tests", () => {
    it("should have correct ProcessingContext shape", () => {
      const context = {
        existingMembers: [] as GroupMember[],
        added: 0,
        skipped: 0,
        errors: 0,
        details: [] as SyncResultDetail[],
        failedRows: [] as SyncResultFailedRow[],
      };

      expect(context.added).toBe(0);
      expect(context.skipped).toBe(0);
      expect(context.errors).toBe(0);
    });

    it("should create SyncResult with schema class", () => {
      const result = new SyncResult({
        added: 5,
        skipped: 2,
        errors: 1,
        duration: 1500,
        details: [new SyncResultDetail({ name: "A", status: "added", timestamp: "t1" })],
        failedRows: [],
      });

      expect(result.added).toBe(5);
      expect(result.skipped).toBe(2);
      expect(result.errors).toBe(1);
    });
  });

  describe("SyncError", () => {
    it("should create SyncError with message", () => {
      const error = new SyncError({ message: "Sync failed" });
      expect(error._tag).toBe("SyncError");
      expect(error.message).toBe("Sync failed");
    });

    it("should create SyncError with message and cause", () => {
      const cause = new Error("Network error");
      const error = new SyncError({ message: "Sync failed", cause });
      expect(error._tag).toBe("SyncError");
      expect(error.cause).toBe(cause);
    });
  });

  describe("SyncService definition", () => {
    it("should be defined as a service", () => {
      expect(SyncService).toBeDefined();
      expect(SyncService.Default).toBeDefined();
    });
  });

  describe("change detection", () => {
    const testConfig = createTestConfig();
    const configProviderLayer = Layer.setConfigProvider(createTestConfigProvider(testConfig));

    it.effect("should skip sync on second run with unchanged data", () =>
      Effect.gen(function* () {
        const rows = [
          ["Name", "Email", "Phone"],
          ["John Doe", "john@example.com", "+15551234567"],
        ];
        const userContacts = [
          new UserContact({ name: "John Doe", email: "john@example.com", phone: "+15551234567" }),
        ];

        let addMemberCallCount = 0;

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () => Effect.succeed(rows),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.sync(() => {
              addMemberCallCount++;
              return {
                success: true,
                memberId: "12345",
                userId: "u12345",
                alreadyExists: false,
              };
            }),
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        // First run should add the member
        const result1 = yield* syncService.run;
        expect(result1.added).toBe(1);
        expect(addMemberCallCount).toBe(1);

        // Second run with same data should skip (no changes detected)
        const result2 = yield* syncService.run;
        expect(result2.added).toBe(0);
        expect(result2.skipped).toBe(0);
        expect(result2.errors).toBe(0);
        // addMember should NOT be called again
        expect(addMemberCallCount).toBe(1);
      })
    );

    it.effect("should proceed with sync when data changes", () =>
      Effect.gen(function* () {
        let currentRows = [
          ["Name", "Email"],
          ["John", "john@example.com"],
        ];
        let currentContacts = [new UserContact({ name: "John", email: "john@example.com" })];
        let addMemberCallCount = 0;

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () => Effect.succeed(currentRows),
          parseUserContacts: () => Effect.succeed(currentContacts),
        });

        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.sync(() => {
              addMemberCallCount++;
              return {
                success: true,
                memberId: `m${addMemberCallCount}`,
                userId: `u${addMemberCallCount}`,
                alreadyExists: false,
              };
            }),
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        // First run
        const result1 = yield* syncService.run;
        expect(result1.added).toBe(1);
        expect(addMemberCallCount).toBe(1);

        // Change the data
        currentRows = [
          ["Name", "Email"],
          ["John", "john@example.com"],
          ["Jane", "jane@example.com"],
        ];
        currentContacts = [
          new UserContact({ name: "John", email: "john@example.com" }),
          new UserContact({ name: "Jane", email: "jane@example.com" }),
        ];

        // Second run should detect change and proceed
        const result2 = yield* syncService.run;
        expect(result2.added).toBe(2);
        expect(addMemberCallCount).toBe(3); // 1 from first run + 2 from second run
      })
    );
  });

  describe("processContact with mocked services", () => {
    const testConfig = createTestConfig();
    const configProviderLayer = Layer.setConfigProvider(createTestConfigProvider(testConfig));

    it.effect("should add new contact successfully", () =>
      Effect.gen(function* () {
        const userContacts = [
          new UserContact({ name: "John Doe", email: "john@example.com", phone: "+15551234567" }),
        ];

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Email", "Phone"],
              ["John Doe", "john@example.com", "+15551234567"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // Mock GroupMeService - returns success, no existing members
        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.succeed({
              success: true,
              memberId: "12345",
              userId: "u12345",
              alreadyExists: false,
            }),
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        expect(result.added).toBe(1);
        expect(result.skipped).toBe(0);
        expect(result.errors).toBe(0);
        expect(result.details).toHaveLength(1);
        expect(result.details[0].status).toBe("added");
      })
    );

    it.effect("should skip contact that already exists in group (by email)", () =>
      Effect.gen(function* () {
        const userContacts = [
          new UserContact({
            name: "Already Done",
            email: "done@example.com",
            phone: "+15551111111",
          }),
        ];

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Email", "Phone"],
              ["Already Done", "done@example.com", "+15551111111"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // Return existing member with matching email
        const existingMember = new GroupMember({
          user_id: "existing123",
          nickname: "Done User",
          email: "done@example.com",
        });

        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.succeed({
              success: true,
              memberId: "67890",
              userId: "u67890",
              alreadyExists: false,
            }),
          getMembers: () => Effect.succeed([existingMember]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        // Contact should be skipped because they're already in the group
        expect(result.added).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.errors).toBe(0);
        expect(result.details[0].status).toBe("skipped");
        expect(result.details[0].error).toBe("already_in_group");
      })
    );

    it.effect("should skip contact that already exists in group (by phone)", () =>
      Effect.gen(function* () {
        const userContacts = [new UserContact({ name: "Phone User", phone: "+1-555-222-3333" })];

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Phone"],
              ["Phone User", "+1-555-222-3333"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // Return existing member with matching phone (different format)
        const existingMember = new GroupMember({
          user_id: "existing456",
          nickname: "Existing Phone User",
          phone_number: "15552223333", // normalized format
        });

        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.succeed({
              success: true,
              memberId: "67890",
              userId: "u67890",
              alreadyExists: false,
            }),
          getMembers: () => Effect.succeed([existingMember]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        expect(result.added).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.errors).toBe(0);
        expect(result.details[0].status).toBe("skipped");
        expect(result.details[0].error).toBe("already_in_group");
      })
    );

    it.effect("should skip contact that already exists in group (by name)", () =>
      Effect.gen(function* () {
        const userContacts = [new UserContact({ name: "John Smith" })];

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () => Effect.succeed([["Name"], ["John Smith"]]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // Return existing member with matching name (case-insensitive)
        const existingMember = new GroupMember({
          user_id: "existing789",
          nickname: "john smith", // lowercase version
        });

        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.succeed({
              success: true,
              memberId: "67890",
              userId: "u67890",
              alreadyExists: false,
            }),
          getMembers: () => Effect.succeed([existingMember]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        expect(result.added).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.errors).toBe(0);
        expect(result.details[0].status).toBe("skipped");
        expect(result.details[0].error).toBe("already_in_group");
      })
    );

    it.effect("should skip member that already exists in GroupMe (race condition)", () =>
      Effect.gen(function* () {
        const userContacts = [new UserContact({ name: "Bob Smith", email: "bob@example.com" })];

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Email"],
              ["Bob Smith", "bob@example.com"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // GroupMe returns alreadyExists (member added between getMembers and addMember)
        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.succeed({
              success: true,
              memberId: undefined,
              userId: undefined,
              alreadyExists: true,
            }),
          getMembers: () => Effect.succeed([]), // Empty at check time
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        expect(result.added).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.errors).toBe(0);
        expect(result.details[0].status).toBe("skipped");
        expect(result.details[0].error).toBe("already_exists");
      })
    );

    it.effect("should handle GroupMe add failure", () =>
      Effect.gen(function* () {
        const userContacts = [new UserContact({ name: "Carol White", phone: "+15551112222" })];

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Phone"],
              ["Carol White", "+15551112222"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // GroupMe returns failure
        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.succeed({
              success: false,
              memberId: undefined,
              userId: undefined,
              alreadyExists: false,
              errorMessage: "API limit exceeded",
            }),
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        expect(result.added).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toBe(1);
        expect(result.details[0].status).toBe("error");
        expect(result.details[0].error).toBe("API limit exceeded");
        expect(result.failedRows).toHaveLength(1);
      })
    );

    it.effect("should handle GroupMe addMember exception", () =>
      Effect.gen(function* () {
        const userContacts = [new UserContact({ name: "Error User", phone: "+15553334444" })];

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Phone"],
              ["Error User", "+15553334444"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // GroupMe throws an exception
        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.fail(new GroupMeApiError({ message: "Network connection failed" })),
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        expect(result.added).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toBe(1);
        expect(result.details[0].status).toBe("error");
        expect(result.details[0].error).toBe("Network connection failed");
        expect(result.failedRows).toHaveLength(1);
      })
    );

    it.effect("should process multiple contacts", () =>
      Effect.gen(function* () {
        const userContacts = [
          new UserContact({ name: "Alice", email: "alice@example.com" }),
          new UserContact({ name: "Bob", email: "bob@example.com" }),
          new UserContact({ name: "Carol", email: "carol@example.com" }),
        ];

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Email"],
              ["Alice", "alice@example.com"],
              ["Bob", "bob@example.com"],
              ["Carol", "carol@example.com"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        let addMemberCallCount = 0;
        const mockGroupMeService = new GroupMeService({
          validateToken: Effect.succeed({
            id: "user1",
            name: "Test User",
            email: "test@example.com",
          }),
          addMember: () =>
            Effect.sync(() => {
              addMemberCallCount++;
              return {
                success: true,
                memberId: `member${addMemberCallCount}`,
                userId: `user${addMemberCallCount}`,
                alreadyExists: false,
              };
            }),
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GoogleSheetsService, mockGoogleService),
          Layer.succeed(GroupMeService, mockGroupMeService)
        );

        const syncService = yield* Effect.provide(
          SyncService,
          Layer.provide(
            Layer.provide(SyncService.DefaultWithoutDependencies, testLayer),
            configProviderLayer
          )
        );

        const result = yield* syncService.run;

        expect(result.added).toBe(3);
        expect(result.skipped).toBe(0);
        expect(result.errors).toBe(0);
        expect(result.details).toHaveLength(3);
        expect(addMemberCallCount).toBe(3);
      })
    );
  });
});
