import {
  AggregateRow,
  AirtableInsert,
  AirtableRecord,
  AirtableUpdate,
  DiffContext,
  SyncJob,
  SyncStats,
} from "../types/types.ts";
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
    strategy: "PAYROLL" | "ASSIGNMENT",
  ): Map<string, AirtableRecord> {
    const map = new Map<string, AirtableRecord>();

    for (const rec of records) {
      if (strategy === "PAYROLL") {
        const users = rec.fields["User"] as string[] | undefined;
        const projects = rec.fields["Project"] as string[] | undefined;
        const month = rec.fields["Month"] as string | undefined;

        const userId = users?.[0] || "no_user";
        const projectId = projects?.[0] || "no_project";
        const key = `${userId}_${projectId}_${month || ""}`;
        map.set(key, rec);
      } else {
        const name = (rec.fields["Name"] as string) || "";
        map.set(name.trim().toLowerCase(), rec);
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
      let lookupKey = "";

      if (context.job.strategy === "PAYROLL") {
        const dbUserId = row.airtable_user_id || "no_user";
        const dbProjectId = row.airtable_project_id || "no_project";
        lookupKey = `${dbUserId}_${dbProjectId}_${row.month}`;
      } else {
        lookupKey = `${row.user_name} - ${row.project_name} - ${row.month}`
          .trim()
          .toLowerCase();
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
    if (!context.job.allowInserts) {
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

    let fields: Record<string, unknown> = {};

    if (context.job.strategy === "PAYROLL") {
      fields = {
        User: [row.airtable_user_id],
        Project: row.airtable_project_id ? [row.airtable_project_id] : [],
        Month: row.month,
        "Actual Hours": supabaseHours,
      };
    } else {
      // Safety Check: Cannot create assignment without a project ID
      if (!row.airtable_project_id) {
        console.warn(
          `[Diff] No Project ID for ${row.user_name} in ${row.month}. Skipping.`,
        );
        context.stats.missing++;
        return;
      }

      // Rebuild the unbreakable ID key for the lookup
      const [mName, year] = row.month.split(" ");
      const mIndex = new Date(`${mName} 1, 2000`).getMonth() + 1;
      const isoDate = `${year}-${mIndex.toString().padStart(2, "0")}-01`;
      const expectedKey = `${row.airtable_project_id}_${isoDate}`;

      const projectAssignmentId = context.projectAssignmentMap.get(expectedKey);

      if (!projectAssignmentId) {
        console.warn(
          `[Diff] Missing Project Assignment ID for ${expectedKey}. Skipping row.`,
        );
        context.stats.missing++;
        return;
      }

      fields = {
        Person: [row.airtable_user_id],
        "Project Assignment": [projectAssignmentId],
        "Actual Hours": supabaseHours,
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
