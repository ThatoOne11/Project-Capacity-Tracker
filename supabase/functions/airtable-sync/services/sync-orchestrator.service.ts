import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackService } from "../../_shared/services/slack.service.ts";
import { AirtableService } from "./airtable.service.ts";
import { AirtableDiffCalculator } from "../logic/diff.calculator.ts";
import { AggregateRow, SyncJob, SyncStats } from "../types/types.ts";
import { AIRTABLE_CONFIG } from "../../_shared/config.ts";

export class SyncOrchestratorService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly slack: SlackService,
  ) {}

  async runAllJobs(): Promise<{ stats: SyncStats; details: string[] }> {
    const totalStats: SyncStats = {
      updated: 0,
      inserted: 0,
      skipped: 0,
      missing: 0,
    };
    const logMessages: string[] = [];

    // 1. Define the Sync Jobs configuration
    const jobs: SyncJob[] = [
      {
        name: "Calendar Table Sync",
        sourceView: "monthly_aggregates_view",
        destinationTableId: AIRTABLE_CONFIG.tableId,
        allowInserts: false, // Strict: Updates only
      },
      {
        name: "Payroll Table Sync",
        sourceView: "payroll_aggregates_view",
        destinationTableId: AIRTABLE_CONFIG.payrollTableId,
        allowInserts: true, // Automation: Create missing records
      },
    ];

    // 2. Process Each Job
    for (const job of jobs) {
      console.log(`\n--- Starting Job: ${job.name} ---`);

      if (!job.destinationTableId) {
        console.warn(
          `Skipping ${job.name}: No destination table ID configured.`,
        );
        continue;
      }

      await this.executeJob(job, totalStats, logMessages);
      console.log(`--- Finished Job: ${job.name} ---`);
    }

    return { stats: totalStats, details: logMessages };
  }

  private async executeJob(
    job: SyncJob,
    totalStats: SyncStats,
    logMessages: string[],
  ): Promise<void> {
    const airtable = new AirtableService(
      AIRTABLE_CONFIG.pat,
      AIRTABLE_CONFIG.baseId,
      job.destinationTableId,
    );

    // A. Fetch Source Data from Supabase
    const { data: sourceData, error: dbError } = await this.supabase
      .from(job.sourceView)
      .select("*");

    if (dbError) {
      throw new Error(`Supabase Error (${job.sourceView}): ${dbError.message}`);
    }

    // B. Fetch Destination Data from Airtable
    const destinationRecords = await airtable.fetchRecords();

    // C. Calculate Differences
    const { updates, inserts, stats } = AirtableDiffCalculator.calculateDiffs(
      sourceData as AggregateRow[],
      destinationRecords,
      job.allowInserts,
    );

    // D. Execute API Calls
    if (inserts.length > 0) {
      await airtable.createRecords(inserts);
    }

    if (updates.length > 0) {
      await airtable.updateRecords(updates);
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
