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

    // Ensure all IDs exist BEFORE syncing hours
    await this.referenceSync.syncAllReferences();

    // Payroll Jobs
    const jobs: SyncJob[] = [
      {
        name: "People Assignments Table",
        sourceView: "monthly_aggregates_view",
        destinationTableId: AIRTABLE_CONFIG.tableId,
        allowInserts: true,
        strategy: "ASSIGNMENT",
      },
      {
        name: "Payroll Actuals Table",
        sourceView: "payroll_aggregates_view",
        destinationTableId: AIRTABLE_CONFIG.payrollTableId,
        allowInserts: true,
        strategy: "PAYROLL",
      },
    ];

    // B. Process Each Job
    for (const job of jobs) {
      console.log(`[Orchestrator] Starting Job: ${job.name}`);
      await this.executeJob(job, totalStats, logMessages);
      console.log(`[Orchestrator] Finished Job: ${job.name}`);
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
      throw new Error(`Supabase Error (${job.sourceView}): ${dbError.message}`);
    }

    let projectAssignmentMap = new Map<string, string>();
    if (job.strategy === "ASSIGNMENT" && job.allowInserts) {
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

    // ✅ NEW: Deduplicate updates to prevent Airtable API crashes
    // If the diff calculator generated multiple updates for the same Airtable ID,
    // this keeps only the last one.
    const uniqueUpdatesMap = new Map<string, AirtableUpdate>();
    for (const update of updates) {
      uniqueUpdatesMap.set(update.id, update);
    }
    const cleanUpdates = Array.from(uniqueUpdatesMap.values());

    // Execute API Calls
    if (inserts.length > 0) {
      await this.airtable.createRecords(job.destinationTableId, inserts);
    }

    // ✅ Pass the clean, deduplicated updates array
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
