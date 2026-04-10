export const AIRTABLE_FIELDS = {
  // Common & References
  NAME: "Name",
  FULL_NAME: "Full Name",
  PROJECT: "Project",
  MONTH: "Month",

  // Payroll Actuals
  USER: "User",
  ACTUAL_HOURS: "Actual Hours",

  // People Assignments
  PERSON: "Person",
  PROJECT_ASSIGNMENT: "Project Assignment",
  ASSIGNED_HOURS: "Assigned Hours",

  // Project Assignments
  COMMITMENT_HOURS: "Commitment Hours",
  HOURS_TO_BE_PAID: "Hours to be Paid",
  ORIGINAL_INVOICE_AMOUNT: "Original Invoice AMount",
} as const;

// Dictionary of known Airtable errors that indicate a record was deleted
export const GHOST_ERROR_TYPES = [
  "INVALID_RECORD_ID",
  "ROW_DOES_NOT_EXIST",
  "RECORD_NOT_FOUND",
] as const;

export const AIRTABLE_RECORD_ID_PATTERN = /rec[a-zA-Z0-9]{14}/;
