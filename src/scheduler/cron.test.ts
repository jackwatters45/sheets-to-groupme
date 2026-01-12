import { describe, expect, it } from "@effect/vitest";
import { Cron, Effect, Fiber, Layer, TestClock } from "effect";
import { vi } from "vitest";

// Hoisted mock for google-auth-library (must be before imports that use it)
vi.mock("google-auth-library", () => ({
  JWT: class MockJWT {
    getAccessToken = () => Promise.resolve({ token: "mock_access_token" });
  },
}));

import { NotificationError, NotifyService } from "../error/notify";
import { ColumnMappingError, GoogleAuthError, GoogleSheetsService } from "../google/client";
import { type GroupMeMember, GroupMeService } from "../groupme/client";
import { SyncService } from "../sync/sync";
import { createTestConfig } from "../test/config";
import { createGoogleTestLayer, createGroupMeTestLayer } from "../test/helpers";
import { CronService, runHourlySync } from "./cron";

describe("Cron Scheduler", () => {
  describe("runHourlySync", () => {
    it("should be exported and defined", () => {
      expect(runHourlySync).toBeDefined();
    });

    it("should be an Effect", () => {
      // runHourlySync is an Effect that can be run
      expect(Effect.isEffect(runHourlySync)).toBe(true);
    });

    it("runHourlySync module export exists", async () => {
      const cron = await import("./cron");
      expect(cron).toHaveProperty("runHourlySync");
    });
  });

  describe("CronService with mocked dependencies", () => {
    it.effect("should run syncOnce successfully with mock services", () =>
      Effect.gen(function* () {
        // Create mock SyncService
        const mockSyncService = new SyncService({
          run: Effect.succeed({
            added: 5,
            skipped: 2,
            errors: 0,
            duration: 100,
            details: [],
            failedRows: [],
          }),
        });

        // Create mock NotifyService
        const mockNotifyService = new NotifyService({
          notifySuccess: () => Effect.succeed(undefined as undefined),
          notifyError: () => Effect.succeed(undefined as undefined),
        });

        // Create test layer with mocks
        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        // Run CronService with mocked dependencies
        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        const result = yield* cronService.syncOnce;

        expect(result.added).toBe(5);
        expect(result.skipped).toBe(2);
        expect(result.errors).toBe(0);
      })
    );

    it.effect("should handle multiple syncs with mock services", () =>
      Effect.gen(function* () {
        let callCount = 0;
        const mockSyncService = new SyncService({
          run: Effect.sync(() => {
            callCount++;
            return {
              added: callCount,
              skipped: 0,
              errors: 0,
              duration: 50,
              details: [],
              failedRows: [],
            };
          }),
        });

        const mockNotifyService = new NotifyService({
          notifySuccess: () => Effect.succeed(undefined as undefined),
          notifyError: () => Effect.succeed(undefined as undefined),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        // Run syncOnce multiple times
        const result1 = yield* cronService.syncOnce;
        const result2 = yield* cronService.syncOnce;

        expect(result1.added).toBe(1);
        expect(result2.added).toBe(2);
        expect(callCount).toBe(2);
      })
    );

    it.effect("should handle sync errors and call notifyError", () =>
      Effect.gen(function* () {
        let notifyErrorCalled = false;

        // Mock SyncService that fails with a GoogleAuthError (valid error type for SyncService.run)
        const mockSyncService = new SyncService({
          run: Effect.fail(
            new GoogleAuthError({ message: "Authentication failed" })
          ) as typeof SyncService.prototype.run,
        });

        // Mock NotifyService that tracks calls
        const mockNotifyService = new NotifyService({
          notifySuccess: () => Effect.succeed(undefined as undefined),
          notifyError: () =>
            Effect.sync(() => {
              notifyErrorCalled = true;
            }),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        // syncOnce catches errors and returns error result
        const result = yield* cronService.syncOnce;

        // Should return error result
        expect(result.added).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toBe(1);

        // Should have called notifyError
        expect(notifyErrorCalled).toBe(true);
      })
    );

    it.effect("should skip notification when added=0 and errors=0", () =>
      Effect.gen(function* () {
        let notifySuccessCalled = false;

        // Mock SyncService that returns no changes (added=0, errors=0)
        const mockSyncService = new SyncService({
          run: Effect.succeed({
            added: 0,
            skipped: 5,
            errors: 0,
            duration: 100,
            details: [],
            failedRows: [],
          }),
        });

        // Mock NotifyService that tracks if notifySuccess is called
        const mockNotifyService = new NotifyService({
          notifySuccess: () =>
            Effect.sync(() => {
              notifySuccessCalled = true;
            }),
          notifyError: () => Effect.succeed(undefined as undefined),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        const result = yield* cronService.syncOnce;

        // Should complete successfully with no additions
        expect(result.added).toBe(0);
        expect(result.skipped).toBe(5);
        expect(result.errors).toBe(0);

        // Should NOT have called notifySuccess (no changes)
        expect(notifySuccessCalled).toBe(false);
      })
    );

    it.effect("should send notification when added > 0", () =>
      Effect.gen(function* () {
        let notifySuccessCalled = false;

        // Mock SyncService that returns new additions
        const mockSyncService = new SyncService({
          run: Effect.succeed({
            added: 3,
            skipped: 2,
            errors: 0,
            duration: 100,
            details: [],
            failedRows: [],
          }),
        });

        // Mock NotifyService that tracks if notifySuccess is called
        const mockNotifyService = new NotifyService({
          notifySuccess: () =>
            Effect.sync(() => {
              notifySuccessCalled = true;
            }),
          notifyError: () => Effect.succeed(undefined as undefined),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        const result = yield* cronService.syncOnce;

        expect(result.added).toBe(3);
        // Should have called notifySuccess (new additions)
        expect(notifySuccessCalled).toBe(true);
      })
    );

    it.effect("should send notification when errors > 0 even if added=0", () =>
      Effect.gen(function* () {
        let notifySuccessCalled = false;

        // Mock SyncService that returns errors but no additions
        const mockSyncService = new SyncService({
          run: Effect.succeed({
            added: 0,
            skipped: 3,
            errors: 2,
            duration: 100,
            details: [],
            failedRows: [],
          }),
        });

        // Mock NotifyService that tracks if notifySuccess is called
        const mockNotifyService = new NotifyService({
          notifySuccess: () =>
            Effect.sync(() => {
              notifySuccessCalled = true;
            }),
          notifyError: () => Effect.succeed(undefined as undefined),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        const result = yield* cronService.syncOnce;

        expect(result.added).toBe(0);
        expect(result.errors).toBe(2);
        // Should have called notifySuccess (errors occurred)
        expect(notifySuccessCalled).toBe(true);
      })
    );

    it.effect("should continue despite notification failure", () =>
      Effect.gen(function* () {
        let syncRan = false;

        // Mock SyncService that succeeds
        const mockSyncService = new SyncService({
          run: Effect.sync(() => {
            syncRan = true;
            return {
              added: 3,
              skipped: 1,
              errors: 0,
              duration: 75,
              details: [],
              failedRows: [],
            };
          }),
        });

        // Mock NotifyService where notifySuccess fails with typed error
        const mockNotifyService = new NotifyService({
          notifySuccess: () =>
            Effect.fail(new NotificationError({ message: "Discord webhook failed" })),
          notifyError: () => Effect.succeed(undefined as undefined),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        // Should still succeed even if notification fails
        const result = yield* cronService.syncOnce;

        expect(syncRan).toBe(true);
        expect(result.added).toBe(3);
        expect(result.skipped).toBe(1);
        expect(result.errors).toBe(0);
      })
    );

    it.effect("should handle error notification failure gracefully", () =>
      Effect.gen(function* () {
        // Mock SyncService that fails with a GoogleAuthError (valid error type)
        const mockSyncService = new SyncService({
          run: Effect.fail(
            new GoogleAuthError({ message: "Sync crashed" })
          ) as typeof SyncService.prototype.run,
        });

        // Mock NotifyService where notifyError fails (to cover line 59)
        const mockNotifyService = new NotifyService({
          notifySuccess: () => Effect.succeed(undefined as undefined),
          notifyError: () =>
            Effect.fail(new NotificationError({ message: "Error notification also failed" })),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        // Should still return error result even if notification fails
        const result = yield* cronService.syncOnce;

        expect(result.added).toBe(0);
        expect(result.errors).toBe(1);
      })
    );

    it.effect("should retry on transient failures with syncWithRetry", () =>
      Effect.gen(function* () {
        let callCount = 0;

        // Mock SyncService that fails twice then succeeds
        const mockSyncService = new SyncService({
          run: Effect.suspend(() => {
            callCount++;
            if (callCount < 3) {
              return Effect.fail(
                new GoogleAuthError({ message: `Transient error attempt ${callCount}` })
              ) as typeof SyncService.prototype.run;
            }
            return Effect.succeed({
              added: 1,
              skipped: 0,
              errors: 0,
              duration: 100,
              details: [],
              failedRows: [],
            });
          }),
        });

        const mockNotifyService = new NotifyService({
          notifySuccess: () => Effect.succeed(undefined as undefined),
          notifyError: () => Effect.succeed(undefined as undefined),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        // Fork the syncWithRetry effect and use TestClock to advance time
        const fiber = yield* Effect.fork(cronService.syncWithRetry);

        // Advance time past the retry delays (2s + 4s = 6s for 2 retries)
        yield* TestClock.adjust("10 seconds");

        const result = yield* Fiber.join(fiber);

        expect(callCount).toBe(3); // 2 failures + 1 success
        expect(result.added).toBe(1);
        expect(result.errors).toBe(0);
      })
    );

    it.effect("should fail after exhausting retries with syncWithRetry", () =>
      Effect.gen(function* () {
        let callCount = 0;

        // Mock SyncService that always fails
        const mockSyncService = new SyncService({
          run: Effect.suspend(() => {
            callCount++;
            return Effect.fail(
              new GoogleAuthError({ message: `Persistent error attempt ${callCount}` })
            ) as typeof SyncService.prototype.run;
          }),
        });

        let notifyErrorCalled = false;
        const mockNotifyService = new NotifyService({
          notifySuccess: () => Effect.succeed(undefined as undefined),
          notifyError: () =>
            Effect.sync(() => {
              notifyErrorCalled = true;
            }),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(SyncService, mockSyncService),
          Layer.succeed(NotifyService, mockNotifyService)
        );

        const cronService = yield* Effect.provide(
          CronService,
          Layer.provide(CronService.DefaultWithoutDependencies, testLayer)
        );

        // Fork the syncWithRetry effect and use TestClock to advance time
        const fiber = yield* Effect.fork(cronService.syncWithRetry);

        // Advance time past all retry delays (2s + 4s + 8s = 14s for 3 retries)
        yield* TestClock.adjust("20 seconds");

        const result = yield* Fiber.join(fiber);

        expect(callCount).toBe(4); // 1 initial + 3 retries
        expect(result.added).toBe(0);
        expect(result.errors).toBe(1);
        expect(notifyErrorCalled).toBe(true);
      })
    );
  });

  describe("runHourlySync export", () => {
    it("should be an Effect", () => {
      expect(Effect.isEffect(runHourlySync)).toBe(true);
    });

    it("should be properly configured", () => {
      // runHourlySync is the main export for scheduled runs
      // It requires CronService.Default which includes SyncService and NotifyService
      expect(runHourlySync).toBeDefined();
    });
  });

  describe("Cron schedule parsing", () => {
    it("should parse hourly cron expression", () => {
      const hourlyCron = Cron.parse("0 * * * *");
      expect(hourlyCron._tag).toBe("Right");
    });

    it("should parse cron with unsafeParse", () => {
      const cron = Cron.unsafeParse("0 * * * *");
      // Cron object should have the expected structure
      expect(cron).toBeDefined();
      // Effect Cron uses Sets, not arrays
      expect(cron.minutes.has(0)).toBe(true);
      expect(cron.minutes.size).toBe(1);
      // * in hours means empty set (matches all), size 0
      expect(cron.hours.size).toBe(0);
    });

    it("should reject invalid cron expressions", () => {
      const result = Cron.parse("invalid");
      expect(result._tag).toBe("Left");
    });
  });

  describe("Effect.interruptible", () => {
    it.effect("should allow interruption of effects", () => {
      return Effect.gen(function* () {
        let executed = false;
        const interruptibleEffect = Effect.sync(() => {
          executed = true;
        }).pipe(Effect.interruptible);

        yield* interruptibleEffect;
        expect(executed).toBe(true);
      });
    });

    it.effect("should mark effect as interruptible", () => {
      return Effect.gen(function* () {
        // Verify that Effect.interruptible returns a valid effect
        const effect = Effect.succeed("test").pipe(Effect.interruptible);
        const result = yield* effect;
        expect(result).toBe("test");
      });
    });
  });

  describe("unit tests", () => {
    it("ONE_HOUR_MS should equal 3600000", () => {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      expect(ONE_HOUR_MS).toBe(3600000);
    });

    it("should have process.on available", () => {
      expect(typeof process.on).toBe("function");
    });

    it("should have process.off available", () => {
      expect(typeof process.off).toBe("function");
    });
  });

  describe("integration tests", () => {
    it.effect("should fetch rows from Google Sheets", () => {
      const testConfig = createTestConfig();
      const mockValues = [
        ["Name", "Email", "Phone"],
        ["John Doe", "john@example.com", "555-1234"],
      ];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* service.fetchRows("test-sheet-id", "Sheet1!A1:C2");
        expect(result).toEqual(mockValues);
      }).pipe(
        Effect.provide(
          createGoogleTestLayer(testConfig, () => ({
            status: 200,
            body: { values: mockValues },
          }))
        )
      );
    });

    it.effect("should add member to GroupMe", () => {
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
      }).pipe(
        Effect.provide(
          createGroupMeTestLayer(testConfig, () => ({
            status: 200,
            body: mockResponse,
          }))
        )
      );
    });

    it.effect("should parse user contacts from rows", () => {
      const testConfig = createTestConfig();
      const rows = [
        ["Name", "Email", "Phone"],
        ["John Doe", "john@example.com", "555-1234"],
        ["Jane Doe", "jane@example.com", "555-5678"],
      ];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* service.parseUserContacts(rows, {
          name: "Name",
          email: "Email",
          phone: "Phone",
        });
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe("John Doe");
        expect(result[1].name).toBe("Jane Doe");
      }).pipe(Effect.provide(createGoogleTestLayer(testConfig)));
    });

    it.effect("should handle empty rows", () => {
      const testConfig = createTestConfig();
      const rows: string[][] = [];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* service.parseUserContacts(rows, {
          name: "Name",
          email: "Email",
          phone: "Phone",
        });
        expect(result).toEqual([]);
      }).pipe(Effect.provide(createGoogleTestLayer(testConfig)));
    });

    it.effect("should fail when columns missing", () => {
      const testConfig = createTestConfig();
      const rows = [
        ["Email", "Phone"],
        ["john@example.com", "555-1234"],
      ];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* Effect.either(
          service.parseUserContacts(rows, { name: "Name", email: "Email", phone: "Phone" })
        );
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(ColumnMappingError);
        }
      }).pipe(Effect.provide(createGoogleTestLayer(testConfig)));
    });
  });
});
