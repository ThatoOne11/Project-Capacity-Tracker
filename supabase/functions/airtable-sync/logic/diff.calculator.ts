import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";
import { SyncStrategies } from "../constants/sync.consts.ts";
import { SyncStrategy } from "../constants/sync.consts.ts";
import {
  AirtableInsert,
  AirtableRecord,
  AirtableUpdate,
  DiffContext,
  SyncJob,
  SyncStats,
} from "../types/airtable.types.ts";
import { AggregateRow } from "../types/sync.types.ts";
import { AirtableSyncStrategy } from "./strategies/sync-strategy.interface.ts";
import { PayrollStrategy } from "./strategies/payroll.strategy.ts";
import { AssignmentStrategy } from "./strategies/assignment.strategy.ts";

// Calculates required insertions and updates to sync Supabase aggregates
// with Airtable. Prevents ghost rows and protects against data loss.
export class AirtableDiffCalculator {
  static calculateDiffs(
    sourceRows: AggregateRow[],
    destinationRecords: AirtableRecord[],
    job: SyncJob,
    projectAssignmentMap: Map<string, string> = new Map(),
  ): {
    updates: AirtableUpdate[];
    inserts: AirtableInsert[];
    stats: SyncStats;
  } {
    const context: DiffContext = {
      updates: [],
      inserts: [],
      stats: { updated: 0, inserted: 0, skipped: 0, missing: 0 },
      touchedAirtableIds: new Set<string>(),
      job,
      projectAssignmentMap,
    };

    const strategy = this.getStrategy(job.strategy);

    const airtableMap = this.buildAirtableMap(destinationRecords, strategy);
    this.processSourceRows(sourceRows, airtableMap, strategy, context);
    this.processDeletedRecords(destinationRecords, context);

    return {
      updates: context.updates,
      inserts: context.inserts,
      stats: context.stats,
    };
  }

  private static getStrategy(strategy: SyncStrategy): AirtableSyncStrategy {
    if (strategy === SyncStrategies.PAYROLL) return new PayrollStrategy();
    if (strategy === SyncStrategies.ASSIGNMENT) return new AssignmentStrategy();
    throw new Error(`[DiffCalculator] Unknown sync strategy: ${strategy}`);
  }

  private static buildAirtableMap(
    records: AirtableRecord[],
    strategy: AirtableSyncStrategy,
  ): Map<string, AirtableRecord> {
    const map = new Map<string, AirtableRecord>();

    for (const rec of records) {
      map.set(strategy.buildMapKey(rec), rec);
    }
    return map;
  }

  private static processSourceRows(
    sourceRows: AggregateRow[],
    airtableMap: Map<string, AirtableRecord>,
    strategy: AirtableSyncStrategy,
    context: DiffContext,
  ): void {
    for (const row of sourceRows) {
      if (strategy.shouldSkipRow(row)) {
        context.stats.skipped++;
        continue;
      }

      const lookupKey = strategy.buildLookupKey(row, context);
      const match = airtableMap.get(lookupKey);
      const supabaseHours = Number.parseFloat(row.total_hours) || 0;

      if (match) {
        this.handleExistingRecord(match, supabaseHours, strategy, context);
      } else {
        this.handleMissingRecord(row, supabaseHours, strategy, context);
      }
    }
  }

  private static handleMissingRecord(
    row: AggregateRow,
    supabaseHours: number,
    strategy: AirtableSyncStrategy,
    context: DiffContext,
  ): void {
    if (!context.job.allowInserts || !row.airtable_user_id?.trim()) {
      context.stats.missing++;
      return;
    }

    const fields = strategy.buildInsertFields(row, supabaseHours, context);

    if (!fields) {
      context.stats.missing++;
      return;
    }

    context.inserts.push({ fields });
    context.stats.inserted++;
  }

  private static handleExistingRecord(
    match: AirtableRecord,
    supabaseHours: number,
    strategy: AirtableSyncStrategy,
    context: DiffContext,
  ): void {
    context.touchedAirtableIds.add(match.id);

    const updateFields = strategy.buildUpdateFields(
      match,
      supabaseHours,
      context,
    );

    if (updateFields) {
      context.updates.push({ id: match.id, fields: updateFields });
      context.stats.updated++;
    } else {
      context.stats.skipped++;
    }
  }

  private static processDeletedRecords(
    destinationRecords: AirtableRecord[],
    context: DiffContext,
  ): void {
    for (const record of destinationRecords) {
      if (context.touchedAirtableIds.has(record.id)) continue;

      const rawValue = record.fields[AIRTABLE_FIELDS.ACTUAL_HOURS];
      if (rawValue !== 0 && rawValue !== undefined) {
        context.updates.push({
          id: record.id,
          fields: { [AIRTABLE_FIELDS.ACTUAL_HOURS]: 0 },
        });
        context.stats.updated++;
      }
    }
  }
}
