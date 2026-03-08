import {
  AggregateRow,
  AirtableInsert,
  AirtableRecord,
  AirtableUpdate,
  DiffContext,
  SyncJob,
  SyncStats,
} from "../types/types.ts";
import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";
import { SyncStrategies } from "../constants/consts.ts";

//Calculates the exact insertions and updates required to sync Supabase aggregates
// with existing Airtable records, ensuring zero ghost rows and preventing data loss.
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

    const airtableMap = this.buildAirtableMap(destinationRecords, job.strategy);
    this.processSourceRows(sourceRows, airtableMap, context);
    this.processDeletedRecords(destinationRecords, context);

    return {
      updates: context.updates,
      inserts: context.inserts,
      stats: context.stats,
    };
  }

  private static buildAirtableMap(
    records: AirtableRecord[],
    strategy: string,
  ): Map<string, AirtableRecord> {
    const map = new Map<string, AirtableRecord>();

    for (const rec of records) {
      if (strategy === SyncStrategies.PAYROLL) {
        const users = rec.fields[AIRTABLE_FIELDS.USER] as string[] | undefined;
        const projects = rec.fields[AIRTABLE_FIELDS.PROJECT] as
          | string[]
          | undefined;
        const month = rec.fields[AIRTABLE_FIELDS.MONTH] as string | undefined;

        const userId = users?.[0] || "no_user";
        const projectId = projects?.[0] || "no_project";

        map.set(`${userId}_${projectId}_${month || ""}`, rec);
      } else {
        const persons = rec.fields[AIRTABLE_FIELDS.PERSON] as
          | string[]
          | undefined;
        const projAssignments = rec
          .fields[AIRTABLE_FIELDS.PROJECT_ASSIGNMENT] as string[] | undefined;

        const personId = persons?.[0] || "no_person";

        // Tags orphaned records with their own ID to isolate them from active updates
        const projectAssignmentId = projAssignments?.[0] || `orphan_${rec.id}`;

        map.set(`${personId}_${projectAssignmentId}`, rec);
      }
    }

    return map;
  }

  private static processSourceRows(
    sourceRows: AggregateRow[],
    airtableMap: Map<string, AirtableRecord>,
    context: DiffContext,
  ): void {
    for (const row of sourceRows) {
      // Unassigned time must be skipped for People Assignments, but permitted for Payroll
      if (
        context.job.strategy === SyncStrategies.ASSIGNMENT &&
        !row.airtable_project_id
      ) {
        context.stats.skipped++;
        continue;
      }

      let lookupKey = "";

      if (context.job.strategy === SyncStrategies.PAYROLL) {
        const dbUserId = row.airtable_user_id || "no_user";
        const dbProjectId = row.airtable_project_id || "no_project";
        lookupKey = `${dbUserId}_${dbProjectId}_${row.month}`;
      } else {
        // Convert 'Month Year' to Airtable ISO date ('2025-01-01')
        const [monthName, year] = row.month.split(" ");
        const monthIndex = new Date(`${monthName} 1, 2000`).getMonth() + 1;
        const isoDate = `${year}-${monthIndex.toString().padStart(2, "0")}-01`;

        const projectAssignmentKey = `${row.airtable_project_id}_${isoDate}`;
        const projectAssignmentId = context.projectAssignmentMap.get(
          projectAssignmentKey,
        );
        const personId = row.airtable_user_id || "no_person";

        lookupKey = projectAssignmentId
          ? `${personId}_${projectAssignmentId}`
          : `unmatchable_${personId}_${isoDate}`;
      }

      const match = airtableMap.get(lookupKey);
      const supabaseHours = Number.parseFloat(row.total_hours) || 0;

      if (match) {
        this.handleExistingRecord(match, supabaseHours, context);
      } else {
        this.handleMissingRecord(row, supabaseHours, context);
      }
    }
  }

  private static handleMissingRecord(
    row: AggregateRow,
    supabaseHours: number,
    context: DiffContext,
  ): void {
    if (!context.job.allowInserts || !row.airtable_user_id) {
      context.stats.missing++;
      return;
    }

    let fields: Record<string, unknown> = {};

    if (context.job.strategy === SyncStrategies.PAYROLL) {
      fields = {
        [AIRTABLE_FIELDS.USER]: [row.airtable_user_id],
        [AIRTABLE_FIELDS.PROJECT]: row.airtable_project_id
          ? [row.airtable_project_id]
          : [],
        [AIRTABLE_FIELDS.MONTH]: row.month,
        [AIRTABLE_FIELDS.ACTUAL_HOURS]: supabaseHours,
      };
    } else {
      const [monthName, year] = row.month.split(" ");
      const monthIndex = new Date(`${monthName} 1, 2000`).getMonth() + 1;
      const isoDate = `${year}-${monthIndex.toString().padStart(2, "0")}-01`;

      const projectAssignmentKey = `${row.airtable_project_id}_${isoDate}`;
      const projectAssignmentId = context.projectAssignmentMap.get(
        projectAssignmentKey,
      );

      if (!projectAssignmentId) {
        console.warn(
          `[DiffCalculator] Skipping insert for ${row.user_name}: Missing Project Assignment for ${row.month}`,
        );
        context.stats.missing++;
        return;
      }

      fields = {
        [AIRTABLE_FIELDS.PERSON]: [row.airtable_user_id],
        [AIRTABLE_FIELDS.PROJECT_ASSIGNMENT]: [projectAssignmentId],
        [AIRTABLE_FIELDS.ACTUAL_HOURS]: supabaseHours,
        [AIRTABLE_FIELDS.ASSIGNED_HOURS]: 0,
      };
    }

    context.inserts.push({ fields });
    context.stats.inserted++;
  }

  private static handleExistingRecord(
    match: AirtableRecord,
    supabaseHours: number,
    context: DiffContext,
  ): void {
    context.touchedAirtableIds.add(match.id);

    const rawAirtableHours = match.fields[AIRTABLE_FIELDS.ACTUAL_HOURS];
    const airtableHours = typeof rawAirtableHours === "number"
      ? rawAirtableHours
      : 0;

    const hasChanged = Math.abs(supabaseHours - airtableHours) > 0.01;
    const isBlankButShouldBeZero = supabaseHours === 0 &&
      rawAirtableHours === undefined;

    const rawAssignedHours = match.fields[AIRTABLE_FIELDS.ASSIGNED_HOURS];
    const needsAssignedZero = rawAssignedHours === undefined &&
      context.job.strategy === SyncStrategies.ASSIGNMENT;

    if (hasChanged || isBlankButShouldBeZero || needsAssignedZero) {
      const fields: Record<string, unknown> = {};

      if (hasChanged || isBlankButShouldBeZero) {
        fields[AIRTABLE_FIELDS.ACTUAL_HOURS] = supabaseHours;
      }

      if (needsAssignedZero) {
        fields[AIRTABLE_FIELDS.ASSIGNED_HOURS] = 0;
      }

      context.updates.push({ id: match.id, fields });
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
