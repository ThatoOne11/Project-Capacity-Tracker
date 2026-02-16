export const SUPABASE_CONFIG = {
    url: Deno.env.get("SUPABASE_URL")!,
    key: Deno.env.get("LEGACY_SERVICE_ROLE_KEY")!,
};

export const CLOCKIFY_CONFIG = {
    apiKey: Deno.env.get("CLOCKIFY_API_KEY")!,
    workspaceId: Deno.env.get("CLOCKIFY_WORKSPACE_ID")!,
};

export const AIRTABLE_CONFIG = {
    pat: Deno.env.get("AIRTABLE_PAT")!,
    baseId: Deno.env.get("AIRTABLE_BASE_ID")!,
    tableId: Deno.env.get("AIRTABLE_TABLE_ID")!,
};

export const SLACK_CONFIG = {
    webhookUrl: Deno.env.get("SLACK_WEBHOOK_URL")!,
};
