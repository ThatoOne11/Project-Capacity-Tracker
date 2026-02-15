import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { TimeEntryRepository } from "../../_shared/repo/time-entry.repo.ts";

export class BackfillService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly clockify: ClockifyService,
    private readonly refRepo: ReferenceRepository,
    private readonly entryRepo: TimeEntryRepository,
  ) {}

  // 1: Syncs Users, Clients, and Projects to ensure foreign keys exist
  async syncReferenceData(): Promise<void> {
    await this.refRepo.upsertUsers(await this.clockify.fetchUsers());
    await this.refRepo.upsertClients(await this.clockify.fetchClients());
    await this.refRepo.upsertProjects(await this.clockify.fetchProjects());
  }

  // 2: Pagination and user iteration loop
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

      // Try/Catch per user to prevent one failure from stopping the whole job
      try {
        let page = 1;
        let hasMore = true;

        // C. Handle Pagination
        while (hasMore) {
          const entries = await this.clockify.fetchUserTimeEntries(
            user.clockify_id,
            startDate,
            page,
          );

          if (!entries || entries.length === 0) {
            hasMore = false;
            break;
          }

          const result = await this.entryRepo.processBatch(entries);
          totalSynced += result.synced;

          page++;

          // D. Rate Limit Protection
          await new Promise((r) => setTimeout(r, 100));
        }
      } catch (err) {
        console.error(
          `   FAILED to backfill ${user.name}: ${(err as Error).message}`,
        );
        // Loop continues to next user automatically
      }
    }

    return totalSynced;
  }
}
