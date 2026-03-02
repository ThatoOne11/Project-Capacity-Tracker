import {
  AggregateRow,
  AirtableInsert,
  AirtableRecord,
  AirtableUpdate,
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
    const updates: AirtableUpdate[] = [];
    const inserts: AirtableInsert[] = [];
    const stats: SyncStats = {
      updated: 0,
      inserted: 0,
      skipped: 0,
      missing: 0,
    };

    const touchedAirtableIds = new Set<string>();

    // 1. Build Normalized Airtable Map
    const airtableMap = new Map<string, AirtableRecord>(
      destinationRecords.map((rec) => [
        rec.fields.Name?.trim().toLowerCase() || "",
        rec,
      ]),
    );

    // 2. Forward Pass: Supabase -> Airtable
    for (const row of sourceRows) {
      const lookupKey = `${row.user_name} - ${row.project_name} - ${row.month}`
        .trim()
        .toLowerCase();

      const match = airtableMap.get(lookupKey);
      const supabaseHours = parseFloat(row.total_hours) || 0;

      // Handle Missing Records (Inserts)
      if (!match) {
        if (allowInserts) {
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
          stats.missing++; // Skip if inserts aren't allowed on this table
        }
        continue;
      }

      // Handle Existing Records (Updates)
      touchedAirtableIds.add(match.id);

      const rawAirtableHours = match.fields["Actual Hours"];
      const airtableHours =
        typeof rawAirtableHours === "number" ? rawAirtableHours : 0;

      // Evaluate Update Triggers
      const hasNumericalDifference =
        Math.abs(supabaseHours - airtableHours) > 0.01;
      const isBlankButShouldBeZero =
        supabaseHours === 0 && rawAirtableHours === undefined;

      if (hasNumericalDifference || isBlankButShouldBeZero) {
        const prevValueLog =
          rawAirtableHours === undefined ? "Blank/Undefined" : airtableHours;

        console.log(
          `MATCH FOUND: Updating ${lookupKey} (${prevValueLog} -> ${supabaseHours})`,
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

    // 3. Reverse Pass: Airtable -> Supabase (Detecting Zeros/Deletions)
    for (const record of destinationRecords) {
      // If a record exists in Airtable but wasn't in our Supabase view, it needs to be zeroed.
      if (!touchedAirtableIds.has(record.id)) {
        const rawValue = record.fields["Actual Hours"];

        // Zero out if it isn't strictly 0 already
        if (rawValue !== 0) {
          console.log(
            `ZEROING OUT: ${record.fields["Name"]} (Was: ${rawValue})`,
          );

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
