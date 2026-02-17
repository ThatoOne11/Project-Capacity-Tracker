import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { TimeEntryRepository } from "../../_shared/repo/time-entry.repo.ts";
import { SUPABASE_CONFIG } from "../../_shared/config.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";
import { SyncReportStats } from "../../_shared/types/types.ts";

export class SyncService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly clockify: ClockifyService,
    private readonly repo: TimeEntryRepository,
    private readonly slack: SlackService,
  ) {}

  //Accept 'lookbackDays', default to 1 (24 hours)
  async syncRecentData(lookbackDays: number = 1): Promise<number> {
    const startTime = performance.now();

    // Initialize Stats
    const stats: SyncReportStats = {
      durationSeconds: 0,
      upserted: 0,
      deleted: 0,
      usersScanned: 0,
      status: "SUCCESS",
    };

    // 1. Calculate Dynamic Window
    const now = new Date();
    const startDateObj = new Date(
      now.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
    );
    const startDateStr = startDateObj.toISOString();

    // Log the mode so we can see it in Supabase logs
    console.log(
      `Sync Mode: ${
        lookbackDays === 1 ? "FAST" : "DEEP CLEAN"
      } (Window: ${lookbackDays} days, Start: ${startDateStr})`,
    );

    // 2. Fetch Target Users
    const { data: users, error } = await this.supabase
      .from("clockify_users")
      .select("id, clockify_id, name");

    if (error || !users) {
      // Alert immediately if we can't even read the database
      const msg = error?.message || "No users returned";
      await this.slack.sendAlert("syncRecentData in SyncService", msg);
      throw new Error(`Could not fetch users to poll: ${msg}`);
    }

    console.log(
      `Checking ${users.length} users for changes since: ${startTime}`,
    );

    // 3. Process Each User
    for (const user of users) {
      try {
        const entries = await this.clockify.fetchRecentUserEntries(
          user.clockify_id,
          startDateStr,
        );

        const { upserted, deleted } = await this.repo.syncUserTimeWindow(
          user.id,
          startDateStr,
          entries,
        );

        // Accumulate Stats
        stats.upserted += upserted;
        stats.deleted += deleted;
        stats.usersScanned++;

        if (upserted + deleted > 0) {
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

    // 4. Finalize & Report
    stats.durationSeconds = parseFloat(
      ((performance.now() - startTime) / 1000).toFixed(2),
    );

    // Only spam Slack if meaningful work was done
    if (stats.upserted > 0 || stats.deleted > 0) {
      await this.slack.sendSyncReport(stats);
    }

    return stats.upserted + stats.deleted;
  }

  // Triggers the Airtable sync function with Slack Alerting
  async triggerAirtableSync(): Promise<void> {
    console.log("Data changed. Triggering Airtable Sync...");

    try {
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
        const errorText = await response.text();
        const errorMsg = `Status: ${response.status} | Body: ${errorText}`;

        console.error(`Failed to trigger Airtable sync: ${errorMsg}`);

        //Send Slack Alert
        await this.slack.sendAlert(
          "triggerAirtableSync in SyncService",
          errorMsg,
        );
      } else {
        console.log("Airtable sync triggered successfully.");
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`Internal Server Error: ${msg}`);

      //Send Slack Alert
      await this.slack.sendAlert("triggerAirtableSync in SyncService", msg);
    }
  }
}
