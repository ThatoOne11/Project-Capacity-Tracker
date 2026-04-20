import { z } from "npm:zod";

export const SyncRequestSchema = z.object({
    lookbackDays: z.number().int().positive().optional(),
});

export type SyncRequestBody = z.infer<typeof SyncRequestSchema>;

export type SyncResult = {
    synced: number;
    skipped: number;
};

export type SyncReportStats = {
    durationSeconds: number;
    upserted: number;
    deleted: number;
    usersScanned: number;
    status: "SUCCESS" | "FAILURE";
    newUsers: string[];
    renamedUsers: string[];
    newProjects: string[];
    newClients: string[];
};

export type TimeEntryRow = {
    clockify_id: string;
    description: string | null;
    start_time: string;
    end_time: string | null;
    duration: string | null;
    user_id: string;
    project_id: string | null;
    deleted_at: string | null;
};

// Shape for a Clockify user row as stored in Supabase.
export type DbUser = {
    id: string;
    clockify_id: string;
    name: string;
    email: string | null;
    slack_id: string | null;
};

// Generic shape for any reference table row (users, projects, clients).
export type ReferenceRecord = {
    id: string;
    name: string;
};

// Shape of a clockify_projects row enriched with its Airtable link status.
export type ProjectRow = {
    id: string;
    name: string;
    client_id: string | null;
    airtable_id: string | null;
};

export type UnassignedTimeRow = {
    user_id: string;
    user_name: string;
    user_email: string | null;
    slack_id: string | null;
    unassigned_hours: number;
};
