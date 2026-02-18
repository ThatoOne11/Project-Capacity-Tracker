import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";
import { SUPABASE_CONFIG } from "../../_shared/config.ts";
import { SyncUtils } from "../utils/sync.utils.ts";
import { UserEntrySyncer } from "./user-entry.syncer.ts";

export class SyncService {
  constructor(
    private readonly refRepo: ReferenceRepository,
    private readonly userSyncer: UserEntrySyncer,
    private readonly slack: SlackService,
  ) {}

  //Accept 'lookbackDays', default to 1 (24 hours)
  async syncRecentData(lookbackDays: number = 1): Promise<number> {
    const startTime = performance.now();
    const stats = SyncUtils.initializeStats();
    const startDate = SyncUtils.calculateStartDate(lookbackDays);

    console.log(
      `Sync Mode: ${lookbackDays === 1 ? "FAST" : "DEEP CLEAN"} ` +
        `(Window: ${lookbackDays} days, Start: ${startDate})`,
    );

    try {
      // 1. Fetch Users (Delegated to Repo)
      const users = await this.refRepo.fetchActiveUsers();
      console.log(`Checking ${users.length} users...`);

      // 2. Process Users (Delegated to UserSyncer)
      for (const user of users) {
        await this.userSyncer.syncUser(user, startDate, stats);
      }
    } catch (err) {
      const msg = (err as Error).message;
      await this.slack.sendAlert("syncRecentData", msg);
      throw err;
    }

    // 3. Finalize & Report (Delegated to Utils & Slack)
    SyncUtils.finalizeStats(stats, startTime);

    // Only spam Slack if meaningful work was done
    const hasChanges = stats.upserted > 0 ||
      stats.deleted > 0 ||
      stats.newUsers.length > 0 ||
      stats.renamedUsers.length > 0 ||
      stats.newProjects.length > 0;

    if (hasChanges) {
      await this.slack.sendSyncReport(stats);
    }

    return stats.upserted + stats.deleted;
  }

  // Triggers the Airtable sync function with Slack Alerting
  async triggerAirtableSync(): Promise<void> {
    console.log("Changes detected. Triggering Airtable Sync...");
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
