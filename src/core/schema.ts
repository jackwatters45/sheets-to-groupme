import * as Schema from "effect/Schema";

/**
 * Effect Schema for UserContact validation.
 * Ensures name is required, email and phone are optional strings.
 */
export const UserContactSchema = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  email: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  phone: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
});

export type UserContact = typeof UserContactSchema.Type;

/**
 * Effect Schema for SyncResultDetail.
 */
export const SyncResultDetailSchema = Schema.Struct({
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

export type SyncResultDetail = typeof SyncResultDetailSchema.Type;

/**
 * Effect Schema for SyncResultFailedRow.
 */
export const SyncResultFailedRowSchema = Schema.Struct({
  rowId: Schema.NonEmptyTrimmedString,
  contact: UserContactSchema,
  error: Schema.NonEmptyTrimmedString,
  timestamp: Schema.NonEmptyTrimmedString,
});

export type SyncResultFailedRow = typeof SyncResultFailedRowSchema.Type;

/**
 * Effect Schema for SyncResult validation.
 */
export const SyncResultSchema = Schema.Struct({
  added: Schema.Number,
  skipped: Schema.Number,
  errors: Schema.Number,
  duration: Schema.Number,
  details: Schema.Array(SyncResultDetailSchema),
  failedRows: Schema.Array(SyncResultFailedRowSchema),
});

export type SyncResult = typeof SyncResultSchema.Type;

/**
 * Type guard for UserContact compatibility using schema.
 */
export const isUserContact = (value: unknown): value is UserContact => {
  return Schema.is(UserContactSchema)(value);
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
  } as UserContact;
};
