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
import { SyncJob, SyncStats } from "../types/airtable.types.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";
import { OrchestratorHelpers } from "../helpers/orchestrator.helpers.ts";

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

      const ghostResult = await this.handleGhostError(
        error,
        totalStats,
        logMessages,
      );
      if (ghostResult) return ghostResult;

      throw error;
    }

    return { stats: totalStats, details: logMessages };
  }

  private async handleGhostError(
    error: Error,
    totalStats: SyncStats,
    logMessages: string[],
  ): Promise<{ stats: SyncStats; details: string[] } | null> {
    const badId = OrchestratorHelpers.extractGhostRecordId(error);

    if (badId) {
      console.warn(
        `[GhostBuster] Detected deleted Airtable ID: ${badId}. Nullifying in Supabase...`,
      );
      await this.refRepo.removeAirtableId(badId);
      await this.slack.sendGhostBusterReport(badId);
      logMessages.push(
        `[GhostBuster] Sync aborted early to heal deleted record ${badId}.`,
      );
      return { stats: totalStats, details: logMessages };
    }

    return null;
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
        .getOrBuildProjectAssignments(sourceData);
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

    const cleanUpdates = OrchestratorHelpers.deduplicateUpdates(updates);

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
