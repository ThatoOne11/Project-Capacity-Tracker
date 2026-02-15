import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { SupabaseRepository } from "../../_shared/repo/supabase.repo.ts";

export class SyncService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly clockify: ClockifyService,
    private readonly repo: SupabaseRepository,
  ) {}

  /**
   * Orchestrates the sync process:
   * 1. Finds all users in DB
   * 2. Polls Clockify for their last 24h of data
   * 3. Upserts new data to DB
   * 4. Triggers Airtable sync if needed
   */
  async syncRecentData(): Promise<number> {
    // 1. Calculate Window (Last 24 Hours)
    const now = new Date();
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString();

    // 2. Fetch Target Users
    const { data: users, error } = await this.supabase
      .from("clockify_users")
      .select("clockify_id, name");

    if (error || !users) throw new Error("Could not fetch users to poll");

    console.log(
      `Checking ${users.length} users for changes since: ${startTime}`,
    );

    let totalSynced = 0;

    // 3. Process Each User
    for (const user of users) {
      try {
        const entries = await this.clockify.fetchRecentUserEntries(
          user.clockify_id,
          startTime,
        );

        if (entries.length > 0) {
          const res = await this.repo.processTimeEntriesBatch(entries);
          totalSynced += res.synced;

          if (res.synced > 0) {
            console.log(
              `   ${user.name}: Synced ${res.synced} new entries.`,
            );
          }
        }
      } catch (err) {
        console.warn(
          `   Error syncing ${user.name}: ${(err as Error).message}`,
        );
      }
    }

    return totalSynced;
  }

  // Triggers the Airtable sync function
  async triggerAirtableSync(): Promise<void> {
    console.log("Triggering Airtable Sync...");
    await this.supabase.functions.invoke("airtable-sync", {
      method: "POST",
    });
  }
}
