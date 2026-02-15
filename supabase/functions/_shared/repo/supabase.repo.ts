import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ClockifyClient,
  ClockifyProject,
  ClockifyTimeEntry,
  ClockifyUser,
  SyncResult,
  TimeEntryRow,
} from "../types/types.ts";

export class SupabaseRepository {
  constructor(private readonly client: SupabaseClient) {}

  async upsertUsers(users: ClockifyUser[]): Promise<void> {
    if (users.length === 0) return;

    const { error } = await this.client.from("clockify_users").upsert(
      users.map((u) => ({
        clockify_id: u.id,
        name: u.name ?? u.email ?? "Unknown User",
        email: u.email,
      })),
      { onConflict: "clockify_id" },
    );

    if (error) throw new Error(`DB Error (Users): ${error.message}`);
  }

  async upsertClients(clients: ClockifyClient[]): Promise<void> {
    if (clients.length === 0) return;

    const { error } = await this.client.from("clockify_clients").upsert(
      clients.map((c) => ({
        clockify_id: c.id,
        name: c.name,
      })),
      { onConflict: "clockify_id" },
    );

    if (error) throw new Error(`DB Error (Clients): ${error.message}`);
  }

  async upsertProjects(projects: ClockifyProject[]): Promise<void> {
    if (projects.length === 0) return;

    const clientIds = [
      ...new Set(projects.map((p) => p.clientId).filter(Boolean)),
    ];

    const { data: dbClients, error: fetchError } = await this.client
      .from("clockify_clients")
      .select("id, clockify_id")
      .in("clockify_id", clientIds);

    if (fetchError) {
      throw new Error(`DB Error (Fetching Clients): ${fetchError.message}`);
    }

    const clientMap = new Map<string, string>(
      dbClients?.map((c) => [c.clockify_id, c.id]) ?? [],
    );

    const { error } = await this.client.from("clockify_projects").upsert(
      projects.map((p) => ({
        clockify_id: p.id,
        name: p.name,
        client_id: p.clientId ? (clientMap.get(p.clientId) ?? null) : null,
      })),
      { onConflict: "clockify_id" },
    );

    if (error) throw new Error(`DB Error (Projects): ${error.message}`);
  }

  async processTimeEntriesBatch(
    entries: ClockifyTimeEntry[],
  ): Promise<SyncResult> {
    if (entries.length === 0) return { synced: 0, skipped: 0 };

    // 1. Bulk Resolve Dependencies (Avoid N+1)
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const projectIds = [
      ...new Set(entries.map((e) => e.projectId).filter(Boolean) as string[]),
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
      throw new Error(`DB Error (Users Resolve): ${usersRes.error.message}`);
    }
    if (projectsRes.error) {
      throw new Error(
        `DB Error (Projects Resolve): ${projectsRes.error.message}`,
      );
    }

    const userMap = new Map<string, string>(
      usersRes.data?.map((u) => [u.clockify_id, u.id]) ?? [],
    );
    const projectMap = new Map<string, string>(
      projectsRes.data?.map((p) => [p.clockify_id, p.id]) ?? [],
    );

    // 2. Transform & Validate
    const rows: TimeEntryRow[] = [];
    let skippedCount = 0;

    for (const entry of entries) {
      const internalUserId = userMap.get(entry.userId);

      // Strict User Check: Entry is invalid without a linked user in our DB
      if (!internalUserId) {
        skippedCount++;
        continue;
      }

      rows.push({
        clockify_id: entry.id,
        description: entry.description ?? null,
        start_time: entry.timeInterval.start,
        end_time: entry.timeInterval.end ?? null,
        duration: entry.timeInterval.duration ?? null,
        user_id: internalUserId,
        project_id: entry.projectId
          ? (projectMap.get(entry.projectId) ?? null)
          : null,
      });
    }

    // 3. Bulk Upsert
    if (rows.length > 0) {
      const { error } = await this.client
        .from("clockify_time_entries")
        .upsert(rows, { onConflict: "clockify_id" });

      if (error) {
        throw new Error(`DB Error (Time Entries Upsert): ${error.message}`);
      }
    }

    return { synced: rows.length, skipped: skippedCount };
  }
}
