import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { TimeEntryRepository } from "../../_shared/repo/time-entry.repo.ts";
import { SUPABASE_CONFIG } from "../../_shared/config.ts";

export class SyncService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly clockify: ClockifyService,
    private readonly repo: TimeEntryRepository,
  ) {}

  async syncRecentData(): Promise<number> {
    // 1. Calculate Window (Last 24 Hours)
    const now = new Date();
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString();

    // 2. Fetch Target Users
    const { data: users, error } = await this.supabase
      .from("clockify_users")
      .select("id, clockify_id, name");

    if (error || !users) throw new Error("Could not fetch users to poll");

    console.log(
      `Checking ${users.length} users for changes since: ${startTime}`,
    );

    let totalChanges = 0;

    // 3. Process Each User
    for (const user of users) {
      try {
        const entries = await this.clockify.fetchRecentUserEntries(
          user.clockify_id,
          startTime,
        );

        // syncUserTimeWindow handles both upserts and soft-deleting removed entries
        const { upserted, deleted } = await this.repo.syncUserTimeWindow(
          user.id,
          startTime,
          entries,
        );

        const userChanges = upserted + deleted;
        totalChanges += userChanges;

        if (userChanges > 0) {
          console.log(
            `   ${user.name}: ${upserted} synced, ${deleted} deleted.`,
          );
        }
      } catch (err) {
        console.warn(
          `   Error syncing ${user.name}: ${(err as Error).message}`,
        );
      }
    }

    return totalChanges;
  }

  // Triggers the Airtable sync function
  async triggerAirtableSync(): Promise<void> {
    console.log("Data changed. Triggering Airtable Sync...");
    const response = await fetch(
      `${SUPABASE_CONFIG.url}/functions/v1/airtable-sync`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error(
        `Failed to trigger Airtable sync: ${response.status} ${await response
          .text()}`,
      );
    } else {
      console.log("Airtable sync triggered successfully.");
    }
  }
}
