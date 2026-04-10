import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";
import { SUPABASE_CONFIG } from "../../_shared/config.ts";
import { SyncUtils } from "../utils/sync.utils.ts";
import { UserEntrySyncer } from "./user-entry.syncer.ts";
import { ReferenceSyncer } from "./reference.syncer.ts";
import { DownstreamSyncError } from "../../_shared/exceptions/custom.exceptions.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";
import { fetchWithBackoff } from "../../_shared/utils/api.utils.ts";

export type SyncRunResult = {
  totalSynced: number;
  mode: "FAST" | "DEEP";
};

export class SyncService {
  constructor(
    private readonly refRepo: ReferenceRepository,
    private readonly userSyncer: UserEntrySyncer,
    private readonly refSyncer: ReferenceSyncer,
    private readonly slack: SlackService,
  ) {}

  // Coordinates the full sync cycle and triggers Airtable downstream if any data changed.
  async runSync(lookbackDays: number): Promise<SyncRunResult> {
    const mode: "FAST" | "DEEP" = lookbackDays > 1 ? "DEEP" : "FAST";
    const totalSynced = await this.syncRecentData(lookbackDays);

    if (totalSynced > 0) {
      await this.triggerAirtableSync();
    } else {
      console.log("No changes detected. Skipping Airtable sync.");
    }

    return { totalSynced, mode };
  }

  private async syncRecentData(lookbackDays: number): Promise<number> {
    const startTime = performance.now();
    const stats = SyncUtils.initializeStats();
    const startDate = SyncUtils.calculateStartDate(lookbackDays);
    const isDeepClean = lookbackDays > 1;

    console.log(
      `Sync Mode: ${
        isDeepClean ? "DEEP CLEAN" : "FAST"
      } (Window: ${lookbackDays} days, Start: ${startDate})`,
    );

    console.log("Syncing references (Users/Projects/Clients)...");
    await this.refSyncer.syncReferences(stats);

    const users = await this.refRepo.fetchActiveUsers();
    console.log(`Checking ${users.length} users...`);

    const userErrors: string[] = [];
    const CONCURRENCY_LIMIT = 5;

    for (let i = 0; i < users.length; i += CONCURRENCY_LIMIT) {
      const userChunk = users.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        userChunk.map(async (user) => {
          try {
            await this.userSyncer.syncUser(user, startDate, stats);
          } catch (err) {
            const safeError = toSafeError(err);
            console.warn(`   Error syncing ${user.name}: ${safeError.message}`);
            userErrors.push(`UserID [${user.id}]: ${safeError.message}`);
          }
        }),
      );
    }

    if (userErrors.length > 0) {
      throw new DownstreamSyncError(
        `Sync completed with errors for ${userErrors.length} user(s):\n${
          userErrors.join("\n")
        }`,
      );
    }

    SyncUtils.finalizeStats(stats, startTime);

    const hasChanges = stats.upserted > 0 ||
      stats.deleted > 0 ||
      stats.newUsers.length > 0 ||
      stats.renamedUsers.length > 0 ||
      stats.newProjects.length > 0;

    // Audit report is only meaningful on the deep-clean run.
    if (isDeepClean && hasChanges) {
      await this.slack.sendSyncReport(stats);
    } else if (hasChanges) {
      console.log("Changes detected in Fast Sync.");
    }

    return stats.upserted + stats.deleted;
  }

  // Triggers the Airtable sync function with Slack Alerting
  private async triggerAirtableSync(): Promise<void> {
    console.log("Changes detected. Triggering Airtable sync...");

    const response = await fetchWithBackoff(
      `${SUPABASE_CONFIG.url}/functions/v1/airtable-sync`,
      {
        method: "POST",
        headers: {
          "x-sync-secret": SUPABASE_CONFIG.syncApiSecret,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new DownstreamSyncError(
        `Airtable sync trigger failed — Status: ${response.status} | Body: ${errorText}`,
      );
    }

    console.log("Airtable sync triggered successfully.");
  }
}
