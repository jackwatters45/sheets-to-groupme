import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { vi } from "vitest";
import {
  SyncResult,
  SyncResultDetail,
  type SyncResultFailedRow,
  UserContact,
} from "../core/schema";
import { GoogleSheetsService } from "../google/client";
import { GroupMeApiError, GroupMeService } from "../groupme/client";
import { StateService } from "../state/store";
import { SyncError, SyncService } from "./sync";

// Create hoisted mock for google-auth-library
const mockJWT = vi.hoisted(() => {
  return class MockJWT {
    getAccessToken = () => Promise.resolve({ token: "mock_access_token" });
  };
});

vi.mock("google-auth-library", () => ({
  JWT: mockJWT,
}));

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

describe("SyncService", () => {
  describe("run - empty data", () => {
    it.effect("should return empty result when no rows", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ values: [] }),
      });

      const testLayer = SyncService.Default.pipe(
        Layer.provide(Layer.setConfigProvider(createTestConfigProvider(testConfig)))
      );

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const syncService = yield* SyncService;
          const result = yield* syncService.run;

          expect(result.added).toBe(0);
          expect(result.skipped).toBe(0);
          expect(result.errors).toBe(0);
          expect(result.details).toHaveLength(0);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer));
    });

    it.effect("should return empty result when no valid contacts", () => {
      const testConfig = createTestConfig();

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ values: [["Name", "Email", "Phone"]] }),
      });

      const testLayer = SyncService.Default.pipe(
        Layer.provide(Layer.setConfigProvider(createTestConfigProvider(testConfig)))
      );

      return Effect.gen(function* () {
        const originalFetch = globalThis.fetch;
        try {
          (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
          const syncService = yield* SyncService;
          const result = yield* syncService.run;

          expect(result.added).toBe(0);
          expect(result.skipped).toBe(0);
          expect(result.errors).toBe(0);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }).pipe(Effect.provide(testLayer));
    });
  });

  describe("interface tests", () => {
    it("should have correct ProcessingContext shape", () => {
      const context = {
        state: { lastRun: null, processedRows: new Map() },
        added: 0,
        skipped: 0,
        errors: 0,
        failedCount: 0,
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
        details: [
          new SyncResultDetail({ rowId: "r1", name: "A", status: "added", timestamp: "t1" }),
        ],
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

  describe("processContact with mocked services", () => {
    const testConfig = createTestConfig();
    const configProviderLayer = Layer.setConfigProvider(createTestConfigProvider(testConfig));

    // Helper to create mock state with mutable Map (to satisfy type constraints)
    const createMockState = (
      lastRun: string | null = null,
      processedRows: Map<string, { rowId: string; timestamp: string; success: boolean }> = new Map()
    ) => ({
      lastRun,
      processedRows,
    });

    it.effect("should add new contact successfully", () =>
      Effect.gen(function* () {
        const userContacts = [
          new UserContact({ name: "John Doe", email: "john@example.com", phone: "+15551234567" }),
        ];

        // Mock StateService
        const mockStateService = new StateService({
          load: Effect.succeed(createMockState()),
          save: () => Effect.succeed(undefined as undefined),
        });

        // Mock GoogleSheetsService
        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Email", "Phone"],
              ["John Doe", "john@example.com", "+15551234567"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // Mock GroupMeService - returns success
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
          Layer.succeed(StateService, mockStateService),
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

    it.effect("should skip row that was already successfully processed", () =>
      Effect.gen(function* () {
        // Row data that will be processed
        const rowData = ["Already Done", "done@example.com", "+15551111111"];
        const userContacts = [
          new UserContact({ name: rowData[0], email: rowData[1], phone: rowData[2] }),
        ];

        // Compute the actual hash for this row (same algorithm as generateRowId)
        const data = rowData.join("|");
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", dataBuffer));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const rowId = hashArray
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .substring(0, 16);

        // Pre-populate state with this exact row hash marked as successfully processed
        const mockState = createMockState(
          new Date().toISOString(),
          new Map([[rowId, { rowId, timestamp: new Date().toISOString(), success: true }]])
        );

        const mockStateService = new StateService({
          load: Effect.succeed(mockState),
          save: () => Effect.succeed(undefined as undefined),
        });

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Email", "Phone"],
              rowData, // Same data we computed hash for
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
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
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(StateService, mockStateService),
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

        // Row should be skipped because it was already successfully processed
        expect(result.added).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.errors).toBe(0);
        expect(result.details[0].status).toBe("skipped");
        expect(result.details[0].error).toBe("already_processed");
      })
    );

    it.effect("should skip member that already exists in GroupMe", () =>
      Effect.gen(function* () {
        const userContacts = [new UserContact({ name: "Bob Smith", email: "bob@example.com" })];

        const mockStateService = new StateService({
          load: Effect.succeed(createMockState()),
          save: () => Effect.succeed(undefined as undefined),
        });

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Email"],
              ["Bob Smith", "bob@example.com"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // GroupMe returns alreadyExists
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
          getMembers: () => Effect.succeed([]),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(StateService, mockStateService),
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

        const mockStateService = new StateService({
          load: Effect.succeed(createMockState()),
          save: () => Effect.succeed(undefined as undefined),
        });

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
          Layer.succeed(StateService, mockStateService),
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

        const mockStateService = new StateService({
          load: Effect.succeed(createMockState()),
          save: () => Effect.succeed(undefined as undefined),
        });

        const mockGoogleService = new GoogleSheetsService({
          fetchRows: () =>
            Effect.succeed([
              ["Name", "Phone"],
              ["Error User", "+15553334444"],
            ]),
          parseUserContacts: () => Effect.succeed(userContacts),
        });

        // GroupMe throws an exception (not just returns {success: false})
        // This covers the catchAll path on line 88
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
          Layer.succeed(StateService, mockStateService),
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

        // Should handle the exception gracefully and mark as error
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

        let savedStateSize = 0;

        const mockStateService = new StateService({
          load: Effect.succeed(createMockState()),
          save: (state) =>
            Effect.sync(() => {
              savedStateSize = state.processedRows.size;
            }),
        });

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
          Layer.succeed(StateService, mockStateService),
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
        expect(savedStateSize).toBe(3);
      })
    );
  });
});
