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

    // 1. Build ID-Based Map
    const airtableMap = new Map<string, AirtableRecord>();
    for (const rec of destinationRecords) {
      const users = rec.fields["User"] as string[] | undefined;
      const projects = rec.fields["Project"] as string[] | undefined;
      const month = rec.fields["Month"] as string | undefined;

      const userId = users?.[0] || "no_user";
      const projectId = projects?.[0] || "no_project";
      const key = `${userId}_${projectId}_${month || ""}`;

      airtableMap.set(key, rec);
    }

    // 2. Forward Pass: Supabase -> Airtable
    for (const row of sourceRows) {
      const dbUserId = row.airtable_user_id || "no_user";
      const dbProjectId = row.airtable_project_id || "no_project";
      const lookupKey = `${dbUserId}_${dbProjectId}_${row.month}`;

      const match = airtableMap.get(lookupKey);
      const supabaseHours = Number.parseFloat(row.total_hours) || 0;

      if (!match) {
        if (allowInserts) {
          // Safety: Don't push a record if the user somehow missing an ID
          if (!row.airtable_user_id) {
            console.warn(
              `Cannot sync row for ${row.user_name} - Missing Airtable ID`,
            );
            stats.missing++;
            continue;
          }

          inserts.push({
            fields: {
              User: [row.airtable_user_id],
              Project: row.airtable_project_id ? [row.airtable_project_id] : [],
              Month: row.month,
              "Actual Hours": supabaseHours,
            },
          });
          stats.inserted++;
          console.log(
            `NEW RECORD: Queued ${lookupKey} for creation (${supabaseHours} hrs)`,
          );
        } else {
          stats.missing++;
        }
        continue;
      }

      // Handle Existing Records (Updates)
      touchedAirtableIds.add(match.id);

      const rawAirtableHours = match.fields["Actual Hours"];
      const airtableHours = typeof rawAirtableHours === "number"
        ? rawAirtableHours
        : 0;

      if (
        Math.abs(supabaseHours - airtableHours) > 0.01 ||
        (supabaseHours === 0 && rawAirtableHours === undefined)
      ) {
        updates.push({
          id: match.id,
          fields: { "Actual Hours": supabaseHours },
        });
        stats.updated++;
      } else {
        stats.skipped++;
      }
    }

    // 3. Reverse Pass (Zero out deletions)
    for (const record of destinationRecords) {
      // If a record exists in Airtable but wasn't in our Supabase view, it needs to be zeroed.
      if (!touchedAirtableIds.has(record.id)) {
        const rawValue = record.fields["Actual Hours"];
        if (rawValue !== 0 && rawValue !== undefined) {
          updates.push({ id: record.id, fields: { "Actual Hours": 0 } });
          stats.updated++;
        }
      }
    }

    return { updates, inserts, stats };
  }
}
