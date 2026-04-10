export const SupabaseTables = {
    CLOCKIFY_CLIENTS: "clockify_clients",
    CLOCKIFY_USERS: "clockify_users",
    CLOCKIFY_PROJECTS: "clockify_projects",
    CLOCKIFY_TIME_ENTRIES: "clockify_time_entries",
} as const;

export const SupabaseViews = {
    MONTHLY_AGGREGATES: "monthly_aggregates_view",
    PAYROLL_AGGREGATES: "payroll_aggregates_view",
} as const;

// Airtable linkable target for time entries logged with no project selected.
export const SentinelRecords = {
    NO_PROJECT_CLOCKIFY_ID: "NO-PROJECT",
} as const;

export type SupabaseViewName = typeof SupabaseViews[keyof typeof SupabaseViews];

export type ReferenceTableName =
    | typeof SupabaseTables.CLOCKIFY_USERS
    | typeof SupabaseTables.CLOCKIFY_PROJECTS
    | typeof SupabaseTables.CLOCKIFY_CLIENTS;
