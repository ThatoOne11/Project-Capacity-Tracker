import {
  AggregateRow,
  AirtableInsert,
  AirtableRecord,
  AirtableUpdate,
  SyncStats,
} from "../types/types.ts";

export class AirtableDiffCalculator {
  //Compares Supabase rows vs Airtable records and returns exactly what needs to change.
  static calculateDiffs(
    sourceRows: AggregateRow[],
    destinationRecords: AirtableRecord[],
    allowInserts: boolean,
  ): {
    updates: AirtableUpdate[];
    inserts: AirtableInsert[];
    stats: SyncStats;
  } {
    const updates: AirtableUpdate[] = [];
    const inserts: AirtableInsert[] = [];
    const stats: SyncStats = {
      updated: 0,
      inserted: 0,
      skipped: 0,
      missing: 0,
    };

    const touchedAirtableIds = new Set<string>();

    // 1. Build Map (Normalized)
    const airtableMap = new Map<string, AirtableRecord>(
      destinationRecords.map((rec) => [
        rec.fields.Name?.trim().toLowerCase() || "",
        rec,
      ]),
    );

    // 1. Forward Pass: Supabase -> Airtable
    for (const row of sourceRows) {
      const lookupKey = `${row.user_name} - ${row.project_name} - ${row.month}`
        .trim()
        .toLowerCase();

      const match = airtableMap.get(lookupKey);
      const supabaseHours = parseFloat(row.total_hours) || 0;

      if (!match) {
        if (allowInserts) {
          // Feature Flag: Package a brand new record for Airtable
          inserts.push({
            fields: {
              User: row.user_name,
              Project: row.project_name,
              Month: row.month,
              "Actual Hours": supabaseHours,
            },
          });
          stats.inserted++;
          console.log(
            `NEW RECORD: Queued ${lookupKey} for creation (${supabaseHours} hrs)`,
          );
        } else {
          stats.missing++; // Just skip and log it
        }
        continue;
      }

      touchedAirtableIds.add(match.id);

      const airtableHours = match.fields["Actual Hours"] || 0;

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

    // 2. Reverse Pass: Airtable -> Supabase (Detecting Zeros)
    // If a record exists in Airtable, has hours > 0, but was NOT touched above,
    // it means it no longer exists in Supabase (or has 0 hours). We must zero it out.
    for (const record of destinationRecords) {
      if (!touchedAirtableIds.has(record.id)) {
        const rawValue = record.fields["Actual Hours"];

        // STRICT CHECK: If it is NOT the number 0 (e.g. 5.0, null, or undefined), force it to 0.
        if (rawValue !== 0) {
          updates.push({
            id: record.id,
            fields: { "Actual Hours": 0 },
          });
          stats.updated++;
        }
      }
    }

    return { updates, inserts, stats };
  }
}
