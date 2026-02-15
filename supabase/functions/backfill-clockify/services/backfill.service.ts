import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { SupabaseRepository } from "../../_shared/repo/supabase.repo.ts";

export class BackfillService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly clockify: ClockifyService,
    private readonly repo: SupabaseRepository,
  ) {}

  // 1: Syncs Users, Clients, and Projects to ensure foreign keys exist
  async syncReferenceData(): Promise<void> {
    console.log("Syncing Reference Data...");
    await this.repo.upsertUsers(await this.clockify.fetchUsers());
    await this.repo.upsertClients(await this.clockify.fetchClients());
    await this.repo.upsertProjects(await this.clockify.fetchProjects());
  }

  //2: Pagination and user iteration loop
  async syncTimeEntries(
    startDate: string,
    targetUserId?: string,
  ): Promise<number> {
    // A. Get the users we need to process
    let userQuery = this.supabase.from("clockify_users").select(
      "clockify_id, name",
    );

    if (targetUserId) {
      userQuery = userQuery.eq("clockify_id", targetUserId);
    }

    const { data: dbUsers, error } = await userQuery;
    if (error || !dbUsers) throw new Error("Could not fetch users from DB");

    console.log(
      `Starting backfill for ${dbUsers.length} user(s) from ${startDate}`,
    );

    let totalSynced = 0;

    // B. Loop through every user
    for (const user of dbUsers) {
      console.log(`   👤 Processing: ${user.name}`);
      let page = 1;
      let hasMore = true;

      // C. Handle Pagination
      while (hasMore) {
        // Note: Backfill uses the standard fetchUserTimeEntries (with page number)
        const entries = await this.clockify.fetchUserTimeEntries(
          user.clockify_id,
          startDate,
          page,
        );

        if (!entries || entries.length === 0) {
          hasMore = false;
          break;
        }

        const result = await this.repo.processTimeEntriesBatch(entries);
        totalSynced += result.synced;

        page++;

        // D. Rate Limit Protection (50ms pause)
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    return totalSynced;
  }
}
