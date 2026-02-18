import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyTimeEntry, SyncResult, TimeEntryRow } from "../types/types.ts";

export class TimeEntryRepository {
    constructor(private readonly client: SupabaseClient) {}

    // Main entry point: Handles Upserts + Soft Deletes for a time window
    async syncUserTimeWindow(
        internalUserId: string,
        startTime: string,
        entries: ClockifyTimeEntry[],
    ): Promise<{ upserted: number; deleted: number }> {
        // 1. Upsert incoming entries
        const { synced } = await this.processBatch(entries);

        // 2. Identify "Ghost" Entries (In DB but NOT in incoming list)
        // We fetch DB IDs and diff in memory to avoid errors
        // A. Get all currently active IDs for this user & window
        const { data: existingRows, error } = await this.client
            .from("clockify_time_entries")
            .select("clockify_id")
            .eq("user_id", internalUserId)
            .gte("start_time", startTime)
            .is("deleted_at", null);

        if (error) {
            console.error("Error checking deletions:", error.message);
            return { upserted: synced, deleted: 0 };
        }

        // B. Calculate difference in memory (Fast & Safe)
        const incomingIds = new Set(entries.map((e) => e.id));
        const idsToDelete = existingRows
            .filter((row) => !incomingIds.has(row.clockify_id))
            .map((row) => row.clockify_id);

        // C. Soft Delete the ghosts
        let deletedCount = 0;
        if (idsToDelete.length > 0) {
            // Batch the deletions just in case (e.g. chunks of 50)
            const BATCH_SIZE = 50;
            for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
                const batch = idsToDelete.slice(i, i + BATCH_SIZE);

                const { error: delError } = await this.client
                    .from("clockify_time_entries")
                    .update({ deleted_at: new Date().toISOString() })
                    .in("clockify_id", batch);

                if (delError) {
                    console.error(
                        "Failed to soft delete batch:",
                        delError.message,
                    );
                } else {
                    deletedCount += batch.length;
                }
            }
        }

        return { upserted: synced, deleted: deletedCount };
    }

    // Processes a raw batch of entries: Resolves IDs -> Transforms -> Upserts
    async processBatch(entries: ClockifyTimeEntry[]): Promise<SyncResult> {
        if (entries.length === 0) return { synced: 0, skipped: 0 };

        // A. Resolve Foreign Keys (Users & Projects)
        const { userMap, projectMap } = await this.resolveDependencies(entries);

        // B. Transform to DB Rows
        const rows: TimeEntryRow[] = [];
        let skipped = 0;

        for (const entry of entries) {
            const dbUserId = userMap.get(entry.userId);

            if (!dbUserId) {
                skipped++;
                continue;
            }

            rows.push({
                clockify_id: entry.id,
                description: entry.description ?? null,
                start_time: entry.timeInterval.start,
                end_time: entry.timeInterval.end ?? null,
                duration: entry.timeInterval.duration ?? null,
                user_id: dbUserId,
                project_id: entry.projectId
                    ? (projectMap.get(entry.projectId) ?? null)
                    : null,
                deleted_at: null, // "Undelete" if it reappears
            });
        }

        // C. Bulk Upsert
        if (rows.length > 0) {
            const { error } = await this.client
                .from("clockify_time_entries")
                .upsert(rows, { onConflict: "clockify_id" });

            if (error) {
                throw new Error(`DB Error (Time Entries): ${error.message}`);
            }
        }

        return { synced: rows.length, skipped };
    }

    // Helper: Batches ID lookups to avoid N+1 queries
    private async resolveDependencies(entries: ClockifyTimeEntry[]) {
        const userIds = [...new Set(entries.map((e) => e.userId))];
        const projectIds = [
            ...new Set(
                entries.map((e) => e.projectId).filter(Boolean) as string[],
            ),
        ];

        const [usersRes, projectsRes] = await Promise.all([
            this.client.from("clockify_users").select("id, clockify_id").in(
                "clockify_id",
                userIds,
            ),
            this.client.from("clockify_projects").select("id, clockify_id").in(
                "clockify_id",
                projectIds,
            ),
        ]);

        if (usersRes.error) {
            throw new Error(
                `Dependency Error (Users): ${usersRes.error.message}`,
            );
        }
        if (projectsRes.error) {
            throw new Error(
                `Dependency Error (Projects): ${projectsRes.error.message}`,
            );
        }

        return {
            userMap: new Map(usersRes.data?.map((u) => [u.clockify_id, u.id])),
            projectMap: new Map(
                projectsRes.data?.map((p) => [p.clockify_id, p.id]),
            ),
        };
    }
}
