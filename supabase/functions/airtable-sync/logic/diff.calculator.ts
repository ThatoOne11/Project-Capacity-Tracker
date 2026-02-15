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

    // Track which Airtable records we have "touched" (matched with Supabase)
    const touchedAirtableIds = new Set<string>();

    // 1. Map for fast lookup
    const airtableMap = new Map<string, AirtableRecord>(
      destinationRecords.map((rec) => [rec.fields.Name.trim(), rec]),
    );

    // 2. Forward Pass: Supabase -> Airtable (Updates & Inserts)
    for (const row of sourceRows) {
      const lookupKey = `${row.user_name} - ${row.project_name} - ${row.month}`;
      const match = airtableMap.get(lookupKey);

      if (!match) {
        stats.missing++; // Record doesn't exist in Airtable yet
        continue;
      }

      touchedAirtableIds.add(match.id); // Mark as visited

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

    // 3. Reverse Pass: Airtable -> Supabase (Detecting Zeros)
    // If a record exists in Airtable, has hours > 0, but was NOT touched above,
    // it means it no longer exists in Supabase (or has 0 hours). We must zero it out.
    for (const record of destinationRecords) {
      if (!touchedAirtableIds.has(record.id)) {
        const currentHours = record.fields["Actual Hours"] || 0;

        // Only update if it actually has data to clear
        if (currentHours > 0.01) {
          console.log(
            `CLEANUP: Zeroing out ${record.fields.Name} (No longer in Supabase)`,
          );
          updates.push({
            id: record.id,
            fields: { "Actual Hours": 0 },
          });
          stats.updated++;
        }
      }
    }

    return { updates, stats };
  }
}
