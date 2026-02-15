import {
  AggregateRow,
  AirtableRecord,
  AirtableUpdate,
  SyncStats,
} from "../types/types.ts";

export class AirtableDiffCalculator {
  //Compares Supabase rows vs Airtable records and returns exactly what needs to change.
  static calculateDiffs(
    sourceRows: AggregateRow[],
    destinationRecords: AirtableRecord[],
  ): { updates: AirtableUpdate[]; stats: SyncStats } {
    const updates: AirtableUpdate[] = [];
    const stats: SyncStats = { updated: 0, skipped: 0, missing: 0 };

    // 1. Build Lookup Map (Optimization)
    const airtableMap = new Map<string, AirtableRecord>(
      destinationRecords.map((rec) => [rec.fields.Name.trim(), rec]),
    );

    // 2. Iterate and Compare
    for (const row of sourceRows) {
      const lookupKey = `${row.user_name} - ${row.project_name} - ${row.month}`;
      const match = airtableMap.get(lookupKey);

      if (!match) {
        stats.missing++;
        continue;
      }

      const supabaseHours = parseFloat(row.total_hours);
      const airtableHours = match.fields["Actual Hours"] || 0;

      // 3. Epsilon Check (Floating Point Math)
      if (Math.abs(supabaseHours - airtableHours) > 0.01) {
        console.log(
          `MATCH FOUND: Updating ${lookupKey} (${airtableHours} -> ${supabaseHours})`,
        );

        updates.push({
          id: match.id,
          fields: { "Actual Hours": supabaseHours },
        });
        stats.updated++;
      } else {
        stats.skipped++;
      }
    }
    return { updates, stats };
  }
}
