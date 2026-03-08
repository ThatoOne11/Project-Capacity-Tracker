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
