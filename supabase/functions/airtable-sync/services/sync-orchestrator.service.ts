import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackService } from "../../_shared/services/slack.service.ts";
import { AirtableService } from "./airtable.service.ts";
import { AirtableDiffCalculator } from "../logic/diff.calculator.ts";
import { ReferenceSyncService } from "./reference-sync.service.ts";
import {
  AggregateRow,
  AirtableUpdate,
  SyncJob,
  SyncStats,
} from "../types/types.ts";
import { AIRTABLE_CONFIG } from "../../_shared/config.ts";
import { SyncStrategies } from "../consts/consts.ts";

export class SyncOrchestratorService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly slack: SlackService,
    private readonly airtable: AirtableService,
    private readonly referenceSync: ReferenceSyncService,
  ) {}

  async runAllJobs(): Promise<{ stats: SyncStats; details: string[] }> {
    const totalStats: SyncStats = {
      updated: 0,
      inserted: 0,
      skipped: 0,
      missing: 0,
    };
    const logMessages: string[] = [];

    // Foundation logic: Establish all IDs prior to numerical sync
    await this.referenceSync.syncAllReferences();

    const jobs: SyncJob[] = [
      {
        name: "People Assignments Table",
        sourceView: "monthly_aggregates_view",
        destinationTableId: AIRTABLE_CONFIG.tableId,
        allowInserts: true,
        strategy: SyncStrategies.ASSIGNMENT,
      },
      {
        name: "Payroll Actuals Table",
        sourceView: "payroll_aggregates_view",
        destinationTableId: AIRTABLE_CONFIG.payrollTableId,
        allowInserts: true,
        strategy: SyncStrategies.PAYROLL,
      },
    ];

    for (const job of jobs) {
      console.log(`\n[SyncOrchestrator] Starting Job: ${job.name}`);
      await this.executeJob(job, totalStats, logMessages);
      console.log(`[SyncOrchestrator] Finished Job: ${job.name}`);
    }

    return { stats: totalStats, details: logMessages };
  }

  private async executeJob(
    job: SyncJob,
    totalStats: SyncStats,
    logMessages: string[],
  ): Promise<void> {
    const { data: sourceData, error: dbError } = await this.supabase.from(
      job.sourceView,
    ).select("*");

    if (dbError) {
      throw new Error(
        `[SyncOrchestrator] Supabase Error (${job.sourceView}): ${dbError.message}`,
      );
    }

    let projectAssignmentMap = new Map<string, string>();

    if (job.strategy === SyncStrategies.ASSIGNMENT && job.allowInserts) {
      projectAssignmentMap = await this.referenceSync
        .getOrBuildProjectAssignments(
          sourceData as AggregateRow[],
        );
    }

    const destinationRecords = await this.airtable.fetchRecords(
      job.destinationTableId,
      job.strategy,
    );

    const { updates, inserts, stats } = AirtableDiffCalculator.calculateDiffs(
      sourceData as AggregateRow[],
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
