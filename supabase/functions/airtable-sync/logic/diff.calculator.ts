import {
  AggregateRow,
  AirtableInsert,
  AirtableRecord,
  AirtableUpdate,
  DiffContext,
  SyncStats,
} from "../types/types.ts";

export class AirtableDiffCalculator {
  //Compares Supabase rows vs Airtable records and returns exact changes needed.
  static calculateDiffs(
    sourceRows: AggregateRow[],
    destinationRecords: AirtableRecord[],
    allowInserts: boolean,
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
    };

    // 1. Build the mapping dictionary
    const airtableMap = this.buildAirtableMap(destinationRecords);

    // 2. Evaluate all rows coming from Supabase
    this.processSourceRows(sourceRows, airtableMap, allowInserts, context);

    // 3. Zero out old Airtable rows that no longer exist in Supabase
    this.processDeletedRecords(destinationRecords, context);

    return {
      updates: context.updates,
      inserts: context.inserts,
      stats: context.stats,
    };
  }

  private static buildAirtableMap(
    records: AirtableRecord[],
  ): Map<string, AirtableRecord> {
    const map = new Map<string, AirtableRecord>();

    for (const rec of records) {
      const users = rec.fields["User"] as string[] | undefined;
      const projects = rec.fields["Project"] as string[] | undefined;
      const month = rec.fields["Month"] as string | undefined;

      const userId = users?.[0] || "no_user";
      const projectId = projects?.[0] || "no_project";
      const key = `${userId}_${projectId}_${month || ""}`;

      map.set(key, rec);
    }

    return map;
  }

  private static processSourceRows(
    sourceRows: AggregateRow[],
    airtableMap: Map<string, AirtableRecord>,
    allowInserts: boolean,
    context: DiffContext,
  ): void {
    for (const row of sourceRows) {
      const dbUserId = row.airtable_user_id || "no_user";
      const dbProjectId = row.airtable_project_id || "no_project";
      const lookupKey = `${dbUserId}_${dbProjectId}_${row.month}`;

      const match = airtableMap.get(lookupKey);
      const supabaseHours = Number.parseFloat(row.total_hours) || 0;

      if (match) {
        this.handleExistingRecord(match, supabaseHours, context);
      } else {
        this.handleMissingRecord(row, supabaseHours, allowInserts, context);
      }
    }
  }

  private static handleMissingRecord(
    row: AggregateRow,
    supabaseHours: number,
    allowInserts: boolean,
    context: DiffContext,
  ): void {
    if (!allowInserts) {
      context.stats.missing++;
      return;
    }

    if (!row.airtable_user_id) {
      console.warn(
        `Cannot sync row for ${row.user_name} - Missing Airtable ID`,
      );
      context.stats.missing++;
      return;
    }

    context.inserts.push({
      fields: {
        User: [row.airtable_user_id],
        Project: row.airtable_project_id ? [row.airtable_project_id] : [],
        Month: row.month,
        "Actual Hours": supabaseHours,
      },
    });

    context.stats.inserted++;
  }

  private static handleExistingRecord(
    match: AirtableRecord,
    supabaseHours: number,
    context: DiffContext,
  ): void {
    context.touchedAirtableIds.add(match.id);

    const rawAirtableHours = match.fields["Actual Hours"];
    const airtableHours = typeof rawAirtableHours === "number"
      ? rawAirtableHours
      : 0;

    const hasChanged = Math.abs(supabaseHours - airtableHours) > 0.01;
    const isBlankButShouldBeZero = supabaseHours === 0 &&
      rawAirtableHours === undefined;

    if (hasChanged || isBlankButShouldBeZero) {
      context.updates.push({
        id: match.id,
        fields: { "Actual Hours": supabaseHours },
      });
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
      if (context.touchedAirtableIds.has(record.id)) {
        continue;
      }

      const rawValue = record.fields["Actual Hours"];
      if (rawValue !== 0 && rawValue !== undefined) {
        context.updates.push({ id: record.id, fields: { "Actual Hours": 0 } });
        context.stats.updated++;
      }
    }
  }
}
