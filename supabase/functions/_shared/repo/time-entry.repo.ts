import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SupabaseTables } from "../constants/supabase.constants.ts";
import { ClockifyTimeEntry } from "../types/clockify.types.ts";
import { SyncResult, TimeEntryRow } from "../types/sync.types.ts";

export class TimeEntryRepository {
    constructor(private readonly client: SupabaseClient) {}

    async syncUserTimeWindow(
        internalUserId: string,
        startTime: string,
        entries: ClockifyTimeEntry[],
    ): Promise<{ upserted: number; deleted: number }> {
        const { synced } = await this.processBatch(entries);

        const incomingIds = new Set(entries.map((e) => e.id));
        const idsToDelete = await this.findGhostEntries(
            internalUserId,
            startTime,
            incomingIds,
        );

        const deletedCount = await this.softDeleteEntries(idsToDelete);

        return { upserted: synced, deleted: deletedCount };
    }

    private async findGhostEntries(
        internalUserId: string,
        startTime: string,
        incomingIds: Set<string>,
    ): Promise<string[]> {
        const idsToDelete: string[] = [];
        const DB_CHUNK_SIZE = 1000;
        let offset = 0;

        while (true) {
            const { data: existingRows, error } = await this.client
                .from(SupabaseTables.CLOCKIFY_TIME_ENTRIES)
                .select("clockify_id")
                .eq("user_id", internalUserId)
                .gte("start_time", startTime)
                .is("deleted_at", null)
                .range(offset, offset + DB_CHUNK_SIZE - 1);

            if (error) {
                console.error("Error checking deletions:", error.message);
                break;
            }

            if (!existingRows || existingRows.length === 0) break;

            for (const row of existingRows as Array<{ clockify_id: string }>) {
                if (!incomingIds.has(row.clockify_id)) {
                    idsToDelete.push(row.clockify_id);
                }
            }

            offset += DB_CHUNK_SIZE;
        }

        return idsToDelete;
    }

    private async softDeleteEntries(idsToDelete: string[]): Promise<number> {
        if (idsToDelete.length === 0) return 0;

        let deletedCount = 0;
        const DELETE_BATCH_SIZE = 50;

        for (let i = 0; i < idsToDelete.length; i += DELETE_BATCH_SIZE) {
            const batch = idsToDelete.slice(i, i + DELETE_BATCH_SIZE);

            const { error } = await this.client
                .from(SupabaseTables.CLOCKIFY_TIME_ENTRIES)
                .update({ deleted_at: new Date().toISOString() })
                .in("clockify_id", batch);

            if (error) {
                console.error("Failed to soft delete batch:", error.message);
            } else {
                deletedCount += batch.length;
            }
        }

        return deletedCount;
    }

    async processBatch(entries: ClockifyTimeEntry[]): Promise<SyncResult> {
        if (entries.length === 0) return { synced: 0, skipped: 0 };

        const { userMap, projectMap } = await this.resolveDependencies(entries);

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
                deleted_at: null,
            });
        }

        if (rows.length > 0) {
            const { error } = await this.client
                .from(SupabaseTables.CLOCKIFY_TIME_ENTRIES)
                .upsert(rows, { onConflict: "clockify_id" });

            if (error) {
                throw new Error(`DB Error (Time Entries): ${error.message}`);
            }
        }

        return { synced: rows.length, skipped };
    }

    private async resolveDependencies(entries: ClockifyTimeEntry[]): Promise<{
        userMap: Map<string, string>;
        projectMap: Map<string, string>;
    }> {
        const userIds = [...new Set(entries.map((e) => e.userId))];
        const projectIds = [
            ...new Set(
                entries
                    .map((e) => e.projectId)
                    .filter((id): id is string => id != null),
            ),
        ];

        const [usersRes, projectsRes] = await Promise.all([
            this.client
                .from(SupabaseTables.CLOCKIFY_USERS)
                .select("id, clockify_id")
                .in("clockify_id", userIds),
            this.client
                .from(SupabaseTables.CLOCKIFY_PROJECTS)
                .select("id, clockify_id")
                .in("clockify_id", projectIds),
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
            userMap: new Map<string, string>(
                (usersRes.data as Array<{ clockify_id: string; id: string }>)
                    .map((u) => [u.clockify_id, u.id]),
            ),
            projectMap: new Map<string, string>(
                (projectsRes.data as Array<{ clockify_id: string; id: string }>)
                    .map((p) => [p.clockify_id, p.id]),
            ),
        };
    }
}
