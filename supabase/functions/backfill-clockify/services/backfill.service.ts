import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { TimeEntryRepository } from "../../_shared/repo/time-entry.repo.ts";
import { SupabaseTables } from "../../_shared/constants/supabase.constants.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";
import { DownstreamSyncError } from "../../_shared/exceptions/custom.exceptions.ts";

export class BackfillService {
  constructor(
    private readonly supabase: SupabaseClient,
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
    targetUserId?: string,
  ): Promise<number> {
    // A. Get the users we need to process
    let userQuery = this.supabase.from(SupabaseTables.CLOCKIFY_USERS).select(
      "id, clockify_id, name",
    );

    if (targetUserId) {
      userQuery = userQuery.eq("clockify_id", targetUserId);
    }

    const { data: dbUsers, error } = await userQuery;
    if (error || !dbUsers) throw new Error("Could not fetch users from DB");

    console.log(
      `Starting backfill for ${dbUsers.length} user(s) from ${startDate}`,
    );

    let totalSynced = 0;
    const userErrors: string[] = [];

    // B. Loop through users in concurrent chunks to speed up backfill
    const CONCURRENCY_LIMIT = 5;

    for (let i = 0; i < dbUsers.length; i += CONCURRENCY_LIMIT) {
      const userChunk = dbUsers.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        userChunk.map(async (user) => {
          console.log(`   👤 Processing: ${user.name}`);

          // Try/Catch per user to prevent one failure from stopping the whole job
          try {
            let page = 1;

            // C. Handle Pagination with an explicit break instead of a useless boolean
            while (true) {
              const entries = await this.clockify.fetchUserTimeEntries(
                user.clockify_id,
                startDate,
                page,
              );

              // Break out of the loop when no more entries are found
              if (!entries || entries.length === 0) {
                break;
              }

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
      const detailedErrors = userErrors.join("\n");
      throw new DownstreamSyncError(
        `Backfill completed with partial errors for ${userErrors.length} users:\n${detailedErrors}`,
      );
    }

    return totalSynced;
  }
}
