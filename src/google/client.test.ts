import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

// Hoisted mock for google-auth-library (must be before imports that use it)
vi.mock("google-auth-library", () => ({
  JWT: class MockJWT {
    getAccessToken = () => Promise.resolve({ token: "mock_access_token" });
  },
}));

import { createTestConfig } from "../test/config";
import { createGoogleTestLayer } from "../test/helpers";
import {
  type ColumnIndices,
  ColumnMappingError,
  GoogleAuthError,
  GoogleSheetsService,
  combineName,
  extractUserContacts,
  findColumnIndices,
} from "./client";

// Helper to create ColumnIndices for tests using single name column
const createSingleNameIndices = (
  nameIndex: number,
  emailIndex: number,
  phoneIndex: number
): ColumnIndices => ({
  nameIndex,
  firstNameIndex: -1,
  lastNameIndex: -1,
  emailIndex,
  phoneIndex,
  useSeparateNames: false,
});

// Helper to create ColumnIndices for tests using separate first/last name columns
const createSeparateNameIndices = (
  firstNameIndex: number,
  lastNameIndex: number,
  emailIndex: number,
  phoneIndex: number
): ColumnIndices => ({
  nameIndex: -1,
  firstNameIndex,
  lastNameIndex,
  emailIndex,
  phoneIndex,
  useSeparateNames: true,
});

describe("GoogleSheetsService", () => {
  describe("unit tests", () => {
    it("should have GoogleSheetsService defined", () => {
      expect(GoogleSheetsService).toBeDefined();
      expect(GoogleSheetsService.Default).toBeDefined();
    });

    it("should have GoogleAuthError defined", () => {
      expect(GoogleAuthError).toBeDefined();
    });

    it("should create tagged error instances", () => {
      const error = new GoogleAuthError({
        message: "Test error",
        cause: new Error("underlying"),
      });
      expect(error._tag).toBe("GoogleAuthError");
      expect(error.message).toBe("Test error");
    });
  });

  describe("fetchRows", () => {
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

    it.effect("should return empty array when no values", () => {
      const testConfig = createTestConfig();

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* service.fetchRows("test-sheet-id", "Sheet1!A1:C2");
        expect(result).toEqual([]);
      }).pipe(
        Effect.provide(
          createGoogleTestLayer(testConfig, () => ({
            status: 200,
            body: {},
          }))
        )
      );
    });

    it.effect("should fail when Sheets API returns error", () => {
      const testConfig = createTestConfig();

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* Effect.either(service.fetchRows("test-sheet-id", "Sheet1!A1:C2"));
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GoogleAuthError);
        }
      }).pipe(
        Effect.provide(
          createGoogleTestLayer(testConfig, () => ({
            status: 404,
            body: { error: "Not found" },
          }))
        )
      );
    });
  });

  describe("error handling", () => {
    it("should create GoogleAuthError with cause", () => {
      const cause = new Error("Network error");
      const error = new GoogleAuthError({ message: "Failed", cause });
      expect(error._tag).toBe("GoogleAuthError");
      expect(error.cause).toBe(cause);
    });

    it("should create ColumnMappingError with column info", () => {
      const error = new ColumnMappingError({
        message: "Missing column",
        column: "Name",
      });
      expect(error._tag).toBe("ColumnMappingError");
      expect(error.message).toBe("Missing column");
      expect(error.column).toBe("Name");
    });
  });

  describe("findColumnIndices", () => {
    it("should find columns with exact match", () => {
      const headers = ["Name", "Email", "Phone", "Address"];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(0);
      expect(result.emailIndex).toBe(1);
      expect(result.phoneIndex).toBe(2);
    });

    it("should find columns with case-insensitive match", () => {
      const headers = ["NAME", "email", "PHONE"];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(0);
      expect(result.emailIndex).toBe(1);
      expect(result.phoneIndex).toBe(2);
    });

    it("should handle columns with extra whitespace", () => {
      const headers = ["  Name  ", "  Email  ", "  Phone  "];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(0);
      expect(result.emailIndex).toBe(1);
      expect(result.phoneIndex).toBe(2);
    });

    it("should return -1 for missing columns", () => {
      const headers = ["Name", "Address"];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(0);
      expect(result.emailIndex).toBe(-1);
      expect(result.phoneIndex).toBe(-1);
    });

    it("should return all -1 for empty headers", () => {
      const headers: string[] = [];
      const mapping = { name: "Name", email: "Email", phone: "Phone" };

      const result = findColumnIndices(headers, mapping);

      expect(result.nameIndex).toBe(-1);
      expect(result.emailIndex).toBe(-1);
      expect(result.phoneIndex).toBe(-1);
    });
  });

  describe("extractUserContacts", () => {
    it("should extract contacts from rows", () => {
      const rows = [
        ["John Doe", "john@example.com", "555-1234"],
        ["Jane Doe", "jane@example.com", "555-5678"],
      ];
      const indices = createSingleNameIndices(0, 1, 2);

      const result = extractUserContacts(rows, indices);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: "John Doe", email: "john@example.com", phone: "555-1234" });
      expect(result[1]).toEqual({ name: "Jane Doe", email: "jane@example.com", phone: "555-5678" });
    });

    it("should skip empty rows", () => {
      const rows = [
        ["John Doe", "john@example.com", "555-1234"],
        [],
        ["Jane Doe", "jane@example.com", "555-5678"],
      ];
      const indices = createSingleNameIndices(0, 1, 2);

      const result = extractUserContacts(rows, indices);

      expect(result).toHaveLength(2);
    });

    it("should handle missing optional fields", () => {
      const rows = [["John Doe"], ["Jane Doe", "jane@example.com"]];
      const indices = createSingleNameIndices(0, 1, 2);

      const result = extractUserContacts(rows, indices);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: "John Doe" });
      expect(result[1]).toEqual({ name: "Jane Doe", email: "jane@example.com" });
    });

    it("should trim whitespace from values", () => {
      const rows = [["  John Doe  ", "  john@example.com  ", "  555-1234  "]];
      const indices = createSingleNameIndices(0, 1, 2);

      const result = extractUserContacts(rows, indices);

      expect(result[0]).toEqual({ name: "John Doe", email: "john@example.com", phone: "555-1234" });
    });

    it("should handle empty optional fields", () => {
      const rows = [["John Doe", "", "+1234567890"]];
      const indices = createSingleNameIndices(0, 1, 2);

      const result = extractUserContacts(rows, indices);

      expect(result[0]).toEqual({ name: "John Doe", phone: "+1234567890" });
      expect(result[0].email).toBeUndefined();
    });

    it("should return empty array for no data rows", () => {
      const rows: string[][] = [];
      const indices = createSingleNameIndices(0, 1, 2);

      const result = extractUserContacts(rows, indices);

      expect(result).toHaveLength(0);
    });

    it("should combine first and last name when using separate columns", () => {
      const rows = [
        ["John", "Doe", "john@example.com", "555-1234"],
        ["Jane", "Smith", "jane@example.com", "555-5678"],
      ];
      const indices = createSeparateNameIndices(0, 1, 2, 3);

      const result = extractUserContacts(rows, indices);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("John Doe");
      expect(result[1].name).toBe("Jane Smith");
    });

    it("should handle missing last name in separate columns mode", () => {
      const rows = [["John", "", "john@example.com", "555-1234"]];
      const indices = createSeparateNameIndices(0, 1, 2, 3);

      const result = extractUserContacts(rows, indices);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("John");
    });

    it("should handle missing first name in separate columns mode", () => {
      const rows = [["", "Doe", "john@example.com", "555-1234"]];
      const indices = createSeparateNameIndices(0, 1, 2, 3);

      const result = extractUserContacts(rows, indices);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Doe");
    });

    it("should filter out rows with no name in separate columns mode", () => {
      const rows = [
        ["John", "Doe", "john@example.com", "555-1234"],
        ["", "", "empty@example.com", "555-0000"],
        ["Jane", "Smith", "jane@example.com", "555-5678"],
      ];
      const indices = createSeparateNameIndices(0, 1, 2, 3);

      const result = extractUserContacts(rows, indices);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("John Doe");
      expect(result[1].name).toBe("Jane Smith");
    });
  });

  describe("combineName", () => {
    it("should combine first and last name", () => {
      expect(combineName("John", "Doe")).toBe("John Doe");
    });

    it("should return first name only when last name is empty", () => {
      expect(combineName("John", "")).toBe("John");
    });

    it("should return last name only when first name is empty", () => {
      expect(combineName("", "Doe")).toBe("Doe");
    });

    it("should return empty string when both are empty", () => {
      expect(combineName("", "")).toBe("");
    });

    it("should trim whitespace", () => {
      expect(combineName("  John  ", "  Doe  ")).toBe("John Doe");
    });

    it("should handle whitespace-only values", () => {
      expect(combineName("John", "   ")).toBe("John");
      expect(combineName("   ", "Doe")).toBe("Doe");
      expect(combineName("   ", "   ")).toBe("");
    });
  });

  describe("parseUserContacts", () => {
    it.effect("should parse valid contacts from rows", () => {
      const testConfig = createTestConfig();
      const rows = [
        ["Name", "Email", "Phone"],
        ["John Doe", "john@example.com", "555-1234"],
      ];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* service.parseUserContacts(rows, {
          name: "Name",
          email: "Email",
          phone: "Phone",
        });
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("John Doe");
        expect(result[0].email).toBe("john@example.com");
        expect(result[0].phone).toBe("555-1234");
      }).pipe(Effect.provide(createGoogleTestLayer(testConfig)));
    });

    it.effect("should return empty array for empty rows", () => {
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

    it.effect("should fail when name column is missing", () => {
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
          expect((result.left as ColumnMappingError).column).toBe("Name");
        }
      }).pipe(Effect.provide(createGoogleTestLayer(testConfig)));
    });

    it.effect("should fail when multiple columns are missing", () => {
      const testConfig = createTestConfig();
      const rows = [["Address"], ["123 Main St"]];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* Effect.either(
          service.parseUserContacts(rows, { name: "Name", email: "Email", phone: "Phone" })
        );
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(ColumnMappingError);
          // The first missing column should be reported
          expect(["Name", "Email", "Phone"]).toContain((result.left as ColumnMappingError).column);
        }
      }).pipe(Effect.provide(createGoogleTestLayer(testConfig)));
    });

    it.effect("should handle case-insensitive column matching", () => {
      const testConfig = createTestConfig();
      const rows = [
        ["NAME", "EMAIL", "PHONE"],
        ["John Doe", "john@example.com", "555-1234"],
      ];

      return Effect.gen(function* () {
        const service = yield* GoogleSheetsService;
        const result = yield* service.parseUserContacts(rows, {
          name: "Name",
          email: "Email",
          phone: "Phone",
        });
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("John Doe");
      }).pipe(Effect.provide(createGoogleTestLayer(testConfig)));
    });
  });
});
