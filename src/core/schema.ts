import * as Schema from "effect/Schema";

export class UserContact extends Schema.Class<UserContact>("UserContact")({
  name: Schema.NonEmptyTrimmedString,
  email: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  phone: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
}) {}

export class SyncResultDetail extends Schema.Class<SyncResultDetail>("SyncResultDetail")({
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
}) {}

export class SyncResultFailedRow extends Schema.Class<SyncResultFailedRow>("SyncResultFailedRow")({
  rowId: Schema.NonEmptyTrimmedString,
  contact: UserContact,
  error: Schema.NonEmptyTrimmedString,
  timestamp: Schema.NonEmptyTrimmedString,
}) {}

export class SyncResult extends Schema.Class<SyncResult>("SyncResult")({
  added: Schema.Number,
  skipped: Schema.Number,
  errors: Schema.Number,
  duration: Schema.Number,
  details: Schema.Array(SyncResultDetail),
  failedRows: Schema.Array(SyncResultFailedRow),
}) {}

export const isUserContact = (value: unknown): value is UserContact => {
  return Schema.is(UserContact)(value);
};

/**
 * Validates and transforms raw row data from Google Sheets into a UserContact.
 * @param row - Raw row data from Google Sheets (array of cell values)
 * @param columnMapping - Column indices for name, email, and phone
 * @returns Validated UserContact instance
 * @throws Error if required 'name' column is missing or empty
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

  return new UserContact({
    name,
    email: email || undefined,
    phone: phone || undefined,
  });
};
