import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";
import { SUPABASE_CONFIG } from "../../_shared/config.ts";
import { SyncUtils } from "../utils/sync.utils.ts";
import { UserEntrySyncer } from "./user-entry.syncer.ts";
import { ReferenceSyncer } from "./reference.syncer.ts";
import { DownstreamSyncError } from "../../_shared/exceptions/custom.exceptions.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";

export class SyncService {
  constructor(
    private readonly refRepo: ReferenceRepository,
    private readonly userSyncer: UserEntrySyncer,
    private readonly refSyncer: ReferenceSyncer,
    private readonly slack: SlackService,
  ) {}

  //Accept 'lookbackDays', default to 1 (24 hours)
  async syncRecentData(lookbackDays: number = 1): Promise<number> {
    const startTime = performance.now();
    const stats = SyncUtils.initializeStats();
    const startDate = SyncUtils.calculateStartDate(lookbackDays);

    // Identify if this is the Nightly Audit (3am) or just the hourly check
    const isDeepClean = lookbackDays > 1;

    console.log(
      `Sync Mode: ${
        isDeepClean ? "DEEP CLEAN" : "FAST"
      } (Window: ${lookbackDays} days, Start: ${startDate})`,
    );

    try {
      // Sync References from Clockify
      console.log("Syncing References (Users/Projects/Clients)...");
      await this.refSyncer.syncReferences(stats);

      // Fetch Users
      const users = await this.refRepo.fetchActiveUsers();
      console.log(`Checking ${users.length} users...`);

      const userErrors: string[] = [];

      // Process Users
      for (const user of users) {
        try {
          await this.userSyncer.syncUser(user, startDate, stats);
        } catch (err) {
          const safeError = toSafeError(err);
          console.warn(`   Error syncing ${user.name}: ${safeError.message}`);
          userErrors.push(`UserID [${user.id}]: ${safeError.message}`);
        }
      }

      if (userErrors.length > 0) {
        // Throw custom exception
        throw new DownstreamSyncError(
          `Sync completed with errors for ${userErrors.length} users.`,
        );
      }
    } catch (err) {
      const msg = toSafeError(err).message;
      await this.slack.sendAlert("syncRecentData", msg);
      throw err;
    }

    // Finalize & Report
    SyncUtils.finalizeStats(stats, startTime);
    const hasChanges = stats.upserted > 0 || stats.deleted > 0 ||
      stats.newUsers.length > 0 || stats.renamedUsers.length > 0 ||
      stats.newProjects.length > 0;

    //Only send the report if it's the Deep Clean Cron
    if (isDeepClean && hasChanges) {
      await this.slack.sendSyncReport(stats);
    } else if (hasChanges) {
      console.log("Changes detected in Fast Sync.");
    }

    return stats.upserted + stats.deleted;
  }

  // Triggers the Airtable sync function with Slack Alerting
  async triggerAirtableSync(): Promise<void> {
    console.log("Changes detected. Triggering Airtable Sync...");

    let response: Response;

    try {
      response = await fetch(
        `${SUPABASE_CONFIG.url}/functions/v1/airtable-sync`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (err) {
      const msg = toSafeError(err).message;
      console.error(`Failed to reach Airtable Sync function: ${msg}`);
      await this.slack.sendAlert("triggerAirtableSync in SyncService", msg);
      throw new DownstreamSyncError(
        "Airtable Sync Request Failed.",
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      const errorMsg = `Status: ${response.status} | Body: ${errorText}`;

      console.error(`Failed to trigger Airtable sync: ${errorMsg}`);
      await this.slack.sendAlert(
        "triggerAirtableSync in SyncService",
        errorMsg,
      );

      throw new DownstreamSyncError(
        "Airtable Sync Failed",
      );
    }

    console.log("Airtable sync triggered successfully.");
  }
}
