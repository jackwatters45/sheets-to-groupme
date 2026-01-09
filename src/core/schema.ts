import * as Schema from "effect/Schema";

export interface UserContact {
  name: string;
  email?: string;
  phone?: string;
}

/**
 * Effect Schema for UserContact validation.
 * Ensures name is required, email and phone are optional strings.
 */
export const UserContactSchema: Schema.Schema<UserContact> = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  email: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  phone: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
});

export interface SyncResultDetail {
  rowId: string;
  name: string;
  status: "added" | "skipped" | "error" | "failed";
  error?: string;
  timestamp?: string;
}

export interface SyncResultFailedRow {
  rowId: string;
  contact: UserContact;
  error: string;
  timestamp: string;
}

export interface SyncResult {
  added: number;
  skipped: number;
  errors: number;
  duration: number;
  details: readonly SyncResultDetail[];
  failedRows: readonly SyncResultFailedRow[];
}

/**
 * Effect Schema for SyncResultDetail.
 */
export const SyncResultDetailSchema: Schema.Schema<SyncResultDetail> = Schema.Struct({
  rowId: Schema.NonEmptyTrimmedString,
  name: Schema.NonEmptyTrimmedString,
  status: Schema.Union(
    Schema.Literal("added"),
    Schema.Literal("skipped"),
    Schema.Literal("error"),
    Schema.Literal("failed")
  ),
  error: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
});

/**
 * Effect Schema for SyncResultFailedRow.
 */
export const SyncResultFailedRowSchema: Schema.Schema<SyncResultFailedRow> = Schema.Struct({
  rowId: Schema.NonEmptyTrimmedString,
  contact: UserContactSchema,
  error: Schema.NonEmptyTrimmedString,
  timestamp: Schema.NonEmptyTrimmedString,
});

/**
 * Effect Schema for SyncResult validation.
 */
export const SyncResultSchema: Schema.Schema<SyncResult> = Schema.Struct({
  added: Schema.Number,
  skipped: Schema.Number,
  errors: Schema.Number,
  duration: Schema.Number,
  details: Schema.Array(SyncResultDetailSchema),
  failedRows: Schema.Array(SyncResultFailedRowSchema),
});

/**
 * Type guard for UserContact compatibility.
 * Useful for runtime checks before schema validation.
 */
export const UserContact = {
  is: (value: unknown): value is UserContact => {
    return (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof (value as UserContact).name === "string"
    );
  },
};

/**
 * Validates raw row data from Google Sheets and transforms it to UserContact.
 * @param row - Raw row data (array of cell values)
 * @param columnMapping - Mapping of column names to indices
 * @returns Validated UserContact or throws error
 */
export const validateRowData = (
  row: string[],
  columnMapping: { name: number; email: number; phone: number }
): UserContact => {
  const name = row[columnMapping.name]?.trim();
  const email = row[columnMapping.email]?.trim();
  const phone = row[columnMapping.phone]?.trim();

  if (!name) {
    throw new Error("Row missing required 'name' column");
  }

  return {
    name,
    email: email || undefined,
    phone: phone || undefined,
  };
};
