import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { TimeEntryRepository } from "../../_shared/repo/time-entry.repo.ts";
import { SyncReportStats } from "../../_shared/types/sync.types.ts";

export class UserEntrySyncer {
  constructor(
    private readonly clockify: ClockifyService,
    private readonly repo: TimeEntryRepository,
  ) {}

  async syncUser(
    user: { id: string; clockify_id: string; name: string },
    startDate: string,
    stats: SyncReportStats,
  ) {
    const entries = await this.clockify.fetchRecentUserEntries(
      user.clockify_id,
      startDate,
    );

    const { upserted, deleted } = await this.repo.syncUserTimeWindow(
      user.id,
      startDate,
      entries,
    );

    stats.upserted += upserted;
    stats.deleted += deleted;
    stats.usersScanned++;

    if (upserted + deleted > 0) {
      console.log(`   ${user.name}: ${upserted} synced, ${deleted} deleted.`);
    }
  }
}
