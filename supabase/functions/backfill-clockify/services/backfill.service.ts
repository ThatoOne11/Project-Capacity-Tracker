import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { TimeEntryRepository } from "../../_shared/repo/time-entry.repo.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";
import { DownstreamSyncError } from "../../_shared/exceptions/custom.exceptions.ts";

export class BackfillService {
  constructor(
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
    clockifyUserId?: string,
  ): Promise<number> {
    const dbUsers = await this.refRepo.fetchUsersByClockifyId(clockifyUserId);

    if (dbUsers.length === 0) {
      throw new DownstreamSyncError(
        clockifyUserId
          ? `No user found in DB with clockify_id: ${clockifyUserId}`
          : "No users found in DB — run syncReferenceData first.",
      );
    }

    console.log(
      `Starting backfill for ${dbUsers.length} user(s) from ${startDate}`,
    );

    let totalSynced = 0;
    const userErrors: string[] = [];
    const CONCURRENCY_LIMIT = 5;

    for (let i = 0; i < dbUsers.length; i += CONCURRENCY_LIMIT) {
      const chunk = dbUsers.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        chunk.map(async (user) => {
          console.log(`   👤 Processing: ${user.name}`);

          // Try/Catch per user to prevent one failure from stopping the whole job
          try {
            let page = 1;

            while (true) {
              const entries = await this.clockify.fetchUserTimeEntries(
                user.clockify_id,
                startDate,
                page,
              );

              if (!entries || entries.length === 0) break;

              const result = await this.entryRepo.processBatch(entries);
              totalSynced += result.synced;
              page++;
            }
          } catch (err) {
            const safeError = toSafeError(err);
            console.error(
              `   FAILED to backfill ${user.name}: ${safeError.message}`,
            );
            userErrors.push(`UserID [${user.id}]: ${safeError.message}`);
          }
        }),
      );
    }

    if (userErrors.length > 0) {
      throw new DownstreamSyncError(
        `Backfill completed with partial errors for ${userErrors.length} user(s):\n${
          userErrors.join("\n")
        }`,
      );
    }

    return totalSynced;
  }
}
