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
    deleted_at?: string | null;
};
