type SupabaseConfig = {
    url: string;
    key: string;
    syncApiSecret: string;
};

type ClockifyConfig = {
    apiKey: string;
    workspaceId: string;
};

type AirtableConfig = {
    pat: string;
    baseId: string;
    employeesTableId: string;
    projectsTableId: string;
    clientsTableId: string;
    projectAssignmentsTableId: string;
    peopleAssignmentsTableId: string;
    payrollTableId: string;
};

type SlackConfig = {
    webhookUrl: string;
    botToken: string;
};

export const SUPABASE_CONFIG: SupabaseConfig = {
    url: Deno.env.get("SUPABASE_URL")!,
    key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    syncApiSecret: Deno.env.get("SYNC_API_SECRET")!,
};

export const CLOCKIFY_CONFIG: ClockifyConfig = {
    apiKey: Deno.env.get("CLOCKIFY_API_KEY")!,
    workspaceId: Deno.env.get("CLOCKIFY_WORKSPACE_ID")!,
};

export const AIRTABLE_CONFIG: AirtableConfig = {
    pat: Deno.env.get("AIRTABLE_PAT")!,
    baseId: Deno.env.get("AIRTABLE_BASE_ID")!,
    employeesTableId: Deno.env.get("AIRTABLE_EMPLOYEES_TABLE_ID")!,
    projectsTableId: Deno.env.get("AIRTABLE_PROJECTS_TABLE_ID")!,
    clientsTableId: Deno.env.get("AIRTABLE_CLIENTS_TABLE_ID")!,
    projectAssignmentsTableId: Deno.env.get(
        "AIRTABLE_PROJECT_ASSIGNMENTS_TABLE_ID",
    )!,
    peopleAssignmentsTableId: Deno.env.get(
        "AIRTABLE_PEOPLE_ASSIGNMENTS_TABLE_ID",
    )!,
    payrollTableId: Deno.env.get("AIRTABLE_PAYROLL_TABLE_ID")!,
};

export const SLACK_CONFIG: SlackConfig = {
    webhookUrl: Deno.env.get("SLACK_WEBHOOK_URL")!,
    botToken: Deno.env.get("SLACK_BOT_TOKEN")!,
};
