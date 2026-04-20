import { TimeEntryRepository } from "../../_shared/repo/time-entry.repo.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";
import { IdentityMatcher } from "../../_shared/helpers/identity.helper.ts";
import { UnassignedTimeRow } from "../../_shared/types/sync.types.ts";

export class UnassignedNudgeService {
  constructor(
    private readonly timeRepo: TimeEntryRepository,
    private readonly refRepo: ReferenceRepository,
    private readonly slack: SlackService,
  ) {}

  async execute(targetDate: string): Promise<number> {
    console.log(
      `[UnassignedNudge] Checking unassigned time for: ${targetDate}`,
    );
    const offenders = await this.timeRepo.getUnassignedTimeSummaries(
      targetDate,
    );

    if (offenders.length === 0) {
      console.log(
        `[UnassignedNudge] No unassigned time found.`,
      );
      return 0;
    }

    console.log(
      `[UnassignedNudge] Found ${offenders.length} offender(s). Fetching Slack Roster...`,
    );
    const slackUsers = await this.slack.fetchWorkspaceMembers();
    const unmatchedUsers: UnassignedTimeRow[] = [];

    const CONCURRENCY_LIMIT = 5; // Chunk API calls to prevent rate limits
    for (let i = 0; i < offenders.length; i += CONCURRENCY_LIMIT) {
      const chunk = offenders.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        chunk.map(async (row) => {
          const slackId = IdentityMatcher.findSlackId(
            row.user_email,
            row.user_name,
            row.slack_id,
            slackUsers,
          );

          if (!slackId) {
            unmatchedUsers.push(row);
            return;
          }

          // Cache the ID if this was a new auto-discovery!
          if (!row.slack_id) {
            console.log(
              `[UnassignedNudge] Auto-Discovered Slack ID for ${row.user_name}. Caching...`,
            );
            await this.refRepo.saveSlackId(row.user_id, slackId);
          }

          console.log(`[UnassignedNudge] Sending DM to ${row.user_name}...`);
          await this.slack.sendUnassignedNudgeDM(
            slackId,
            row.unassigned_hours,
            targetDate,
          );
        }),
      );
    }

    // Graceful Admin Fallback
    if (unmatchedUsers.length > 0) {
      console.warn(
        `[UnassignedNudge] Could not map ${unmatchedUsers.length} user(s). Alerting Admin.`,
      );
      await this.slack.sendUnmappedUsersAlert(
        unmatchedUsers.map((u) => ({ name: u.user_name, email: u.user_email })),
      );
    }

    return offenders.length - unmatchedUsers.length; // Return successfully nudged count
  }
}
