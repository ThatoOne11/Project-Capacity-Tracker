import {
  AggregateRow,
  AirtableRecord,
  AirtableUpdate,
  SyncStats,
} from "../types/types.ts";

export class SyncEngine {
  static prepareUpdates(
    sourceRows: AggregateRow[],
    destinationRecords: AirtableRecord[],
  ): { updates: AirtableUpdate[]; stats: SyncStats } {
    const updates: AirtableUpdate[] = [];
    const stats: SyncStats = { updated: 0, skipped: 0, missing: 0 };

    const airtableMap = new Map<string, AirtableRecord>(
      destinationRecords.map((rec) => [rec.fields.Name.trim(), rec]),
    );

    for (const row of sourceRows) {
      const lookupKey = `${row.user_name} - ${row.project_name} - ${row.month}`;
      const match = airtableMap.get(lookupKey);

      if (!match) {
        stats.missing++;
        continue;
      }

      const supabaseHours = parseFloat(row.total_hours);
      const airtableHours = match.fields["Actual Hours"] || 0;

      // Small epsilon to prevent redundant updates due to floating point precision
      if (Math.abs(supabaseHours - airtableHours) > 0.01) {
        console.log(
          `✅ Updating ${lookupKey} (${airtableHours} -> ${supabaseHours})`,
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
