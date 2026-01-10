import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as schema from "./schema";

describe("UserContact Schema", () => {
  describe("UserContact", () => {
    it("should create instance with valid data", () => {
      const contact = new schema.UserContact({
        name: "John Doe",
        email: "john@example.com",
        phone: "+1234567890",
      });
      expect(contact.name).toBe("John Doe");
      expect(contact.email).toBe("john@example.com");
      expect(contact.phone).toBe("+1234567890");
    });

    it("should create instance with only name", () => {
      const contact = new schema.UserContact({ name: "John Doe" });
      expect(contact.name).toBe("John Doe");
    });

    it("should reject empty name in constructor", () => {
      expect(() => new schema.UserContact({ name: "" })).toThrow();
    });

    it("should reject whitespace-only name", () => {
      expect(() => new schema.UserContact({ name: "   " })).toThrow();
    });

    it("should reject empty email", () => {
      expect(() => new schema.UserContact({ name: "John", email: "" })).toThrow();
    });

    it("should reject empty phone", () => {
      expect(() => new schema.UserContact({ name: "John", phone: "" })).toThrow();
    });

    it("should decode from plain object", () => {
      const plain = { name: "John Doe", email: "john@example.com" };
      const result = Schema.decodeUnknownSync(schema.UserContact)(plain);
      expect(result.name).toBe("John Doe");
      expect(result.email).toBe("john@example.com");
    });

    it("should reject non-object values", () => {
      expect(() => Schema.decodeUnknownSync(schema.UserContact)("string")).toThrow();
      expect(() => Schema.decodeUnknownSync(schema.UserContact)(123)).toThrow();
      expect(() => Schema.decodeUnknownSync(schema.UserContact)(null)).toThrow();
    });
  });

  describe("isUserContact type guard", () => {
    it("should return true for UserContact instance", () => {
      const contact = new schema.UserContact({ name: "John Doe" });
      expect(schema.isUserContact(contact)).toBe(true);
    });

    it("should return false for null", () => {
      expect(schema.isUserContact(null)).toBe(false);
    });

    it("should return false for plain objects", () => {
      expect(schema.isUserContact({ name: "John Doe" })).toBe(false);
    });

    it("should return false for primitives", () => {
      expect(schema.isUserContact("string")).toBe(false);
      expect(schema.isUserContact(123)).toBe(false);
    });
  });
});

describe("SyncResultDetail Schema", () => {
  it("should create instance with all fields", () => {
    const detail = new schema.SyncResultDetail({
      rowId: "abc123",
      name: "John Doe",
      status: "added",
      timestamp: "2024-01-01T00:00:00.000Z",
    });
    expect(detail.rowId).toBe("abc123");
    expect(detail.status).toBe("added");
  });

  it("should create instance without optional fields", () => {
    const detail = new schema.SyncResultDetail({
      rowId: "abc123",
      name: "John Doe",
      status: "skipped",
    });
    expect(detail.error).toBeUndefined();
    expect(detail.timestamp).toBeUndefined();
  });

  it("should reject invalid status", () => {
    expect(
      () =>
        new schema.SyncResultDetail({
          rowId: "abc123",
          name: "John",
          status: "invalid" as "added",
        })
    ).toThrow();
  });

  it("should reject empty rowId", () => {
    expect(
      () =>
        new schema.SyncResultDetail({
          rowId: "",
          name: "John",
          status: "added",
        })
    ).toThrow();
  });

  it("should decode from plain object", () => {
    const plain = {
      rowId: "abc123",
      name: "John",
      status: "added" as const,
    };
    const result = Schema.decodeUnknownSync(schema.SyncResultDetail)(plain);
    expect(result.rowId).toBe("abc123");
  });
});

describe("SyncResultFailedRow Schema", () => {
  it("should create instance", () => {
    const failedRow = new schema.SyncResultFailedRow({
      rowId: "abc123",
      contact: new schema.UserContact({ name: "John Doe" }),
      error: "Already exists",
      timestamp: "2024-01-01T00:00:00.000Z",
    });
    expect(failedRow.rowId).toBe("abc123");
    expect(failedRow.error).toBe("Already exists");
  });

  it("should reject empty error", () => {
    expect(
      () =>
        new schema.SyncResultFailedRow({
          rowId: "abc123",
          contact: new schema.UserContact({ name: "John" }),
          error: "",
          timestamp: "2024-01-01T00:00:00.000Z",
        })
    ).toThrow();
  });

  it("should decode from plain object", () => {
    const plain = {
      rowId: "abc123",
      contact: { name: "John Doe" },
      error: "Failed",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const result = Schema.decodeUnknownSync(schema.SyncResultFailedRow)(plain);
    expect(result.rowId).toBe("abc123");
  });
});

describe("SyncResult Schema", () => {
  it("should create instance", () => {
    const result = new schema.SyncResult({
      added: 5,
      skipped: 2,
      errors: 1,
      duration: 1500,
      details: [
        new schema.SyncResultDetail({
          rowId: "r1",
          name: "John",
          status: "added",
        }),
      ],
      failedRows: [],
    });
    expect(result.added).toBe(5);
    expect(result.skipped).toBe(2);
  });

  it("should create instance with failed rows", () => {
    const result = new schema.SyncResult({
      added: 3,
      skipped: 1,
      errors: 2,
      duration: 2000,
      details: [],
      failedRows: [
        new schema.SyncResultFailedRow({
          rowId: "r1",
          contact: new schema.UserContact({ name: "Jane" }),
          error: "Already exists",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      ],
    });
    expect(result.failedRows).toHaveLength(1);
  });

  it("should reject non-array details", () => {
    const invalid = {
      added: 1,
      skipped: 0,
      errors: 0,
      duration: 1000,
      details: "not an array" as unknown,
      failedRows: [],
    };
    expect(() => Schema.decodeUnknownSync(schema.SyncResult)(invalid)).toThrow();
  });

  it("should decode from plain object", () => {
    const plain = {
      added: 5,
      skipped: 2,
      errors: 1,
      duration: 1500,
      details: [{ rowId: "r1", name: "John", status: "added" as const }],
      failedRows: [],
    };
    const result = Schema.decodeUnknownSync(schema.SyncResult)(plain);
    expect(result.added).toBe(5);
    expect(result.details).toHaveLength(1);
  });
});

describe("validateRowData", () => {
  const columnMapping = { name: 0, email: 1, phone: 2 };

  it("should validate row with all fields", () => {
    const row = ["John Doe", "john@example.com", "+1234567890"];
    const result = schema.validateRowData(row, columnMapping);
    expect(result.name).toBe("John Doe");
    expect(result.email).toBe("john@example.com");
    expect(result.phone).toBe("+1234567890");
  });

  it("should validate row with only name", () => {
    const row = ["John Doe", "", ""];
    const result = schema.validateRowData(row, columnMapping);
    expect(result.name).toBe("John Doe");
    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });

  it("should trim whitespace", () => {
    const row = ["  John Doe  ", "  john@example.com  ", "  +1234567890  "];
    const result = schema.validateRowData(row, columnMapping);
    expect(result.name).toBe("John Doe");
  });

  it("should throw error for missing name", () => {
    const row = ["", "john@example.com", "+1234567890"];
    expect(() => schema.validateRowData(row, columnMapping)).toThrow(
      "Row missing required 'name' column"
    );
  });

  it("should use custom column mapping", () => {
    const customMapping = { name: 1, email: 2, phone: 0 };
    const row = ["+1234567890", "John Doe", "john@example.com"];
    const result = schema.validateRowData(row, customMapping);
    expect(result.name).toBe("John Doe");
    expect(result.phone).toBe("+1234567890");
  });

  it("should set optional fields to undefined when empty", () => {
    const row = ["John Doe", "", "+1234567890"];
    const result = schema.validateRowData(row, columnMapping);
    expect(result.email).toBeUndefined();
  });
});
