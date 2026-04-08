import { SlackService } from "../../_shared/services/slack.service.ts";
import { AirtableService } from "./airtable.service.ts";
import { AirtableDiffCalculator } from "../logic/diff.calculator.ts";
import { ReferenceSyncService } from "./reference-sync.service.ts";
import { AggregateRepository } from "../repo/aggregate.repo.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { AggregateRow } from "../types/sync.types.ts";
import { AIRTABLE_CONFIG } from "../../_shared/config.ts";
import { SyncStrategies } from "../constants/sync.consts.ts";
import { SupabaseViews } from "../../_shared/constants/supabase.constants.ts";
import { AirtableUpdate, SyncJob, SyncStats } from "../types/airtable.types.ts";
import {
  AIRTABLE_RECORD_ID_PATTERN,
  GHOST_ERROR_TYPES,
} from "../constants/airtable.constants.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";

export class SyncOrchestratorService {
  constructor(
    private readonly slack: SlackService,
    private readonly airtable: AirtableService,
    private readonly referenceSync: ReferenceSyncService,
    private readonly refRepo: ReferenceRepository,
    private readonly aggregateRepo: AggregateRepository,
  ) {}

  async runAllJobs(): Promise<{ stats: SyncStats; details: string[] }> {
    const totalStats: SyncStats = {
      updated: 0,
      inserted: 0,
      skipped: 0,
      missing: 0,
    };
    const logMessages: string[] = [];

    const jobs: SyncJob[] = [
      {
        name: "People Assignments Table",
        sourceView: SupabaseViews.MONTHLY_AGGREGATES,
        destinationTableId: AIRTABLE_CONFIG.peopleAssignmentsTableId,
        allowInserts: true,
        strategy: SyncStrategies.ASSIGNMENT,
      },
      {
        name: "Payroll Actuals Table",
        sourceView: SupabaseViews.PAYROLL_AGGREGATES,
        destinationTableId: AIRTABLE_CONFIG.payrollTableId,
        allowInserts: true,
        strategy: SyncStrategies.PAYROLL,
      },
    ];

    try {
      // Fetch active names once and pass to reference sync
      const { activeUsers, activeProjects } = await this.aggregateRepo
        .fetchActiveNamesFromViews();
      await this.referenceSync.syncAllReferences(activeUsers, activeProjects);

      for (const job of jobs) {
        console.log(`\n[SyncOrchestrator] Starting Job: ${job.name}`);
        const sourceData = await this.aggregateRepo.fetchAggregateView(
          job.sourceView,
        );
        await this.executeJob(job, sourceData, totalStats, logMessages);
        console.log(`[SyncOrchestrator] Finished Job: ${job.name}`);
      }
    } catch (err: unknown) {
      const error = toSafeError(err);
      const isGhostError = GHOST_ERROR_TYPES.some((type) =>
        error.message.includes(type)
      );

      if (isGhostError) {
        const match = error.message.match(AIRTABLE_RECORD_ID_PATTERN);
        const badId = match?.[0];

        if (badId) {
          console.warn(
            `[GhostBuster] Detected deleted Airtable ID: ${badId}. Nullifying in Supabase...`,
          );

          await this.refRepo.removeAirtableId(badId);

          await this.slack.sendInfo(
            "Ghost Record Caught",
            `Airtable record *${badId}* was manually deleted or corrupted. The system has cleared the internal cache and will auto-heal the link on the next sync.`,
          );

          logMessages.push(
            `[GhostBuster] Sync aborted early to heal deleted record ${badId}.`,
          );

          // Return gracefully - the next cron run will fix it naturally.
          return { stats: totalStats, details: logMessages };
        }
      }

      // If it's a different kind of error, rethrow it to trigger the Slack alert
      throw error;
    }

    return { stats: totalStats, details: logMessages };
  }

  private async executeJob(
    job: SyncJob,
    sourceData: AggregateRow[],
    totalStats: SyncStats,
    logMessages: string[],
  ): Promise<void> {
    let projectAssignmentMap = new Map<string, string>();

    if (job.strategy === SyncStrategies.ASSIGNMENT && job.allowInserts) {
      projectAssignmentMap = await this.referenceSync
        .getOrBuildProjectAssignments(
          sourceData,
        );
    }

    const destinationRecords = await this.airtable.fetchRecords(
      job.destinationTableId,
      job.strategy,
    );

    const { updates, inserts, stats } = AirtableDiffCalculator.calculateDiffs(
      sourceData,
      destinationRecords,
      job,
      projectAssignmentMap,
    );

    // Deduplicate updates to prevent Airtable API batch rejection.
    // Airtable crashes if a batch contains multiple operations targeting the exact same record ID.
    const uniqueUpdatesMap = new Map<string, AirtableUpdate>();
    for (const update of updates) {
      uniqueUpdatesMap.set(update.id, update);
    }
    const cleanUpdates = Array.from(uniqueUpdatesMap.values());

    if (inserts.length > 0) {
      await this.airtable.createRecords(job.destinationTableId, inserts);
    }
    if (cleanUpdates.length > 0) {
      await this.airtable.updateRecords(job.destinationTableId, cleanUpdates);
    }

    totalStats.updated += stats.updated;
    totalStats.inserted += stats.inserted;
    totalStats.skipped += stats.skipped;
    totalStats.missing += stats.missing;

    logMessages.push(
      `[${job.name}] ${stats.inserted} created, ${stats.updated} updated, ${stats.missing} missing.`,
    );
  }
}
