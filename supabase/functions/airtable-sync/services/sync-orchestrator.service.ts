import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackService } from "../../_shared/services/slack.service.ts";
import { AirtableService } from "./airtable.service.ts";
import { AirtableDiffCalculator } from "../logic/diff.calculator.ts";
import { ReferenceSyncService } from "./reference-sync.service.ts";
import { AggregateRow, SyncJob, SyncStats } from "../types/types.ts";
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
        allowInserts: false, // KEPT FALSE AS REQUESTED
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

    const destinationRecords = await this.airtable.fetchRecords(
      job.destinationTableId,
    );

    // C. Calculate Differences
    const { updates, inserts, stats } = AirtableDiffCalculator.calculateDiffs(
      sourceData as AggregateRow[],
      destinationRecords,
      job.allowInserts,
    );

    // D. Execute API Calls
    if (inserts.length > 0) {
      await this.airtable.createRecords(job.destinationTableId, inserts);
    }

    if (updates.length > 0) {
      await this.airtable.updateRecords(job.destinationTableId, updates);
    }

    // E. Aggregate Stats
    totalStats.updated += stats.updated;
    totalStats.inserted += stats.inserted;
    totalStats.skipped += stats.skipped;
    totalStats.missing += stats.missing;

    logMessages.push(
      `[${job.name}] ${stats.inserted} created, ${stats.updated} updated, ${stats.missing} missing.`,
    );
  }
}
