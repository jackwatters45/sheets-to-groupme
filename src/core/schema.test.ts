import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as schema from "./schema";

describe("UserContact Schema", () => {
  describe("UserContactSchema", () => {
    it("should validate valid contact with all fields", () => {
      const validContact = {
        name: "John Doe",
        email: "john@example.com",
        phone: "+1234567890",
      };

      const result = Schema.validateSync(schema.UserContactSchema)(validContact);
      expect(result).toEqual(validContact);
    });

    it("should validate valid contact with only name", () => {
      const validContact = {
        name: "John Doe",
      };

      const result = Schema.validateSync(schema.UserContactSchema)(validContact);
      expect(result).toEqual(validContact);
    });

    it("should validate contact with name and email only", () => {
      const validContact = {
        name: "John Doe",
        email: "john@example.com",
      };

      const result = Schema.validateSync(schema.UserContactSchema)(validContact);
      expect(result).toEqual(validContact);
    });

    it("should validate contact with name and phone only", () => {
      const validContact = {
        name: "John Doe",
        phone: "+1234567890",
      };

      const result = Schema.validateSync(schema.UserContactSchema)(validContact);
      expect(result).toEqual(validContact);
    });

    it("should reject contact with empty name", () => {
      const invalidContact = {
        name: "",
        email: "john@example.com",
      };

      expect(() => Schema.validateSync(schema.UserContactSchema)(invalidContact)).toThrow();
    });

    it("should reject contact with whitespace-only name", () => {
      const invalidContact = {
        name: "   ",
        email: "john@example.com",
      };

      expect(() => Schema.validateSync(schema.UserContactSchema)(invalidContact)).toThrow();
    });

    it("should reject contact with empty email", () => {
      const invalidContact = {
        name: "John Doe",
        email: "",
      };

      expect(() => Schema.validateSync(schema.UserContactSchema)(invalidContact)).toThrow();
    });

    it("should reject contact with empty phone", () => {
      const invalidContact = {
        name: "John Doe",
        phone: "",
      };

      expect(() => Schema.validateSync(schema.UserContactSchema)(invalidContact)).toThrow();
    });

    it("should reject non-object values", () => {
      expect(() => Schema.validateSync(schema.UserContactSchema)("string")).toThrow();
      expect(() => Schema.validateSync(schema.UserContactSchema)(123)).toThrow();
      expect(() => Schema.validateSync(schema.UserContactSchema)(null)).toThrow();
      expect(() => Schema.validateSync(schema.UserContactSchema)(undefined)).toThrow();
    });
  });

  describe("UserContact.is type guard", () => {
    it("should return true for valid UserContact", () => {
      const contact: schema.UserContact = {
        name: "John Doe",
        email: "john@example.com",
      };

      expect(schema.UserContact.is(contact)).toBe(true);
    });

    it("should return true for minimal UserContact", () => {
      const contact: schema.UserContact = {
        name: "John Doe",
      };

      expect(schema.UserContact.is(contact)).toBe(true);
    });

    it("should return false for null", () => {
      expect(schema.UserContact.is(null)).toBe(false);
    });

    it("should return false for non-objects", () => {
      expect(schema.UserContact.is("string")).toBe(false);
      expect(schema.UserContact.is(123)).toBe(false);
    });

    it("should return false for objects without name", () => {
      expect(schema.UserContact.is({ email: "test@example.com" })).toBe(false);
    });

    it("should return false for objects with non-string name", () => {
      expect(schema.UserContact.is({ name: 123 })).toBe(false);
    });
  });
});

describe("SyncResultDetail Schema", () => {
  it("should validate valid detail with all fields", () => {
    const validDetail = {
      rowId: "abc123",
      name: "John Doe",
      status: "added" as const,
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    const result = Schema.validateSync(schema.SyncResultDetailSchema)(validDetail);
    expect(result).toEqual(validDetail);
  });

  it("should validate detail with error", () => {
    const validDetail = {
      rowId: "abc123",
      name: "John Doe",
      status: "error" as const,
      error: "Failed to add member",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    const result = Schema.validateSync(schema.SyncResultDetailSchema)(validDetail);
    expect(result).toEqual(validDetail);
  });

  it("should validate detail without optional fields", () => {
    const validDetail = {
      rowId: "abc123",
      name: "John Doe",
      status: "skipped" as const,
    };

    const result = Schema.validateSync(schema.SyncResultDetailSchema)(validDetail);
    expect(result).toEqual(validDetail);
  });

  it("should reject detail with invalid status", () => {
    const invalidDetail = {
      rowId: "abc123",
      name: "John Doe",
      status: "invalid_status" as unknown as "added" | "skipped" | "error" | "failed",
    };

    expect(() => Schema.validateSync(schema.SyncResultDetailSchema)(invalidDetail)).toThrow();
  });

  it("should reject detail with empty rowId", () => {
    const invalidDetail = {
      rowId: "",
      name: "John Doe",
      status: "added" as const,
    };

    expect(() => Schema.validateSync(schema.SyncResultDetailSchema)(invalidDetail)).toThrow();
  });
});

describe("SyncResultFailedRow Schema", () => {
  it("should validate valid failed row", () => {
    const validFailedRow = {
      rowId: "abc123",
      contact: { name: "John Doe", email: "john@example.com" },
      error: "Failed to add member",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    const result = Schema.validateSync(schema.SyncResultFailedRowSchema)(validFailedRow);
    expect(result).toEqual(validFailedRow);
  });

  it("should reject failed row with empty error", () => {
    const invalidFailedRow = {
      rowId: "abc123",
      contact: { name: "John Doe" },
      error: "",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    expect(() => Schema.validateSync(schema.SyncResultFailedRowSchema)(invalidFailedRow)).toThrow();
  });
});

describe("SyncResult Schema", () => {
  it("should validate valid sync result", () => {
    const validResult = {
      added: 5,
      skipped: 2,
      errors: 1,
      duration: 1500,
      details: [
        {
          rowId: "abc123",
          name: "John Doe",
          status: "added" as const,
        },
      ],
      failedRows: [],
    };

    const result = Schema.validateSync(schema.SyncResultSchema)(validResult);
    expect(result).toEqual(validResult);
  });

  it("should validate sync result with failed rows", () => {
    const validResult = {
      added: 3,
      skipped: 1,
      errors: 2,
      duration: 2000,
      details: [
        {
          rowId: "abc123",
          name: "John Doe",
          status: "added" as const,
        },
      ],
      failedRows: [
        {
          rowId: "def456",
          contact: { name: "Jane Doe" },
          error: "Already exists",
          timestamp: "2024-01-01T00:00:00.000Z",
        },
      ],
    };

    const result = Schema.validateSync(schema.SyncResultSchema)(validResult);
    expect(result).toEqual(validResult);
  });

  it("should reject sync result with non-array details", () => {
    const invalidResult = {
      added: 1,
      skipped: 0,
      errors: 0,
      duration: 1000,
      details: "not an array" as unknown,
      failedRows: [],
    };

    expect(() => Schema.validateSync(schema.SyncResultSchema)(invalidResult)).toThrow();
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

  it("should trim whitespace from values", () => {
    const row = ["  John Doe  ", "  john@example.com  ", "  +1234567890  "];

    const result = schema.validateRowData(row, columnMapping);

    expect(result.name).toBe("John Doe");
    expect(result.email).toBe("john@example.com");
    expect(result.phone).toBe("+1234567890");
  });

  it("should handle undefined values", () => {
    const row: string[] = ["John Doe"];

    const result = schema.validateRowData(row, columnMapping);

    expect(result.name).toBe("John Doe");
    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });

  it("should throw error for missing name", () => {
    const row = ["", "john@example.com", "+1234567890"];

    expect(() => schema.validateRowData(row, columnMapping)).toThrow(
      "Row missing required 'name' column"
    );
  });

  it("should throw error for whitespace-only name", () => {
    const row = ["   ", "john@example.com", "+1234567890"];

    expect(() => schema.validateRowData(row, columnMapping)).toThrow(
      "Row missing required 'name' column"
    );
  });

  it("should use custom column mapping", () => {
    const customMapping = { name: 1, email: 2, phone: 0 };
    const row = ["+1234567890", "John Doe", "john@example.com"];

    const result = schema.validateRowData(row, customMapping);

    expect(result.name).toBe("John Doe");
    expect(result.email).toBe("john@example.com");
    expect(result.phone).toBe("+1234567890");
  });

  it("should set optional fields to undefined when empty string", () => {
    const row = ["John Doe", "", "+1234567890"];

    const result = schema.validateRowData(row, columnMapping);

    expect(result.name).toBe("John Doe");
    expect(result.email).toBeUndefined();
    expect(result.phone).toBe("+1234567890");
  });
});
