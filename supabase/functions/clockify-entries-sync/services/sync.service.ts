import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { TimeEntryRepository } from "../../_shared/repo/time-entry.repo.ts";
import { SUPABASE_CONFIG } from "../../_shared/config.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";

export class SyncService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly clockify: ClockifyService,
    private readonly repo: TimeEntryRepository,
    private readonly slack: SlackService,
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

    if (error || !users) {
      // Alert immediately if we can't even read the database
      const msg = error?.message || "No users returned";
      await this.slack.sendAlert("syncRecentData (Fetch Users)", msg);
      throw new Error(`Could not fetch users to poll: ${msg}`);
    }

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
        // 1. Capture the error details
        const errorText = await response.text();
        const errorMsg = `Status: ${response.status} | Body: ${errorText}`;

        console.error(`Failed to trigger Airtable sync: ${errorMsg}`);

        // 2. Send Slack Alert
        await this.slack.sendAlert(
          "triggerAirtableSync (Response Error)",
          errorMsg,
        );
      } else {
        console.log("Airtable sync triggered successfully.");
      }
    } catch (err) {
      // 3. Catch Fetch Errors (e.g. DNS issues, timeouts)
      const msg = (err as Error).message;
      console.error(`Internal Server Error triggering Airtable sync: ${msg}`);

      await this.slack.sendAlert(
        "triggerAirtableSync (Internal Server Error)",
        msg,
      );
    }
  }
}
