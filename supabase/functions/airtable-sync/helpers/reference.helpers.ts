import { AggregateRow } from "../types/sync.types.ts";
import { AirtableRecord } from "../types/airtable.types.ts";
import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";
import { formatMonthToIsoDate } from "../../_shared/utils/date.utils.ts";

export class ReferenceHelpers {
  // Safely normalizes names for idempotent matching
  static normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  // Assembles the deduplication map and isolates conflicted human entries
  static buildAirtableStateMap(
    existingAirtableRecords: Array<{ id: string; name: string }>,
  ): { normalizedMap: Map<string, string>; conflictedNames: Set<string> } {
    const normalizedMap = new Map<string, string>();
    const conflictedNames = new Set<string>();

    for (const rec of existingAirtableRecords) {
      const normalized = this.normalizeName(rec.name);
      if (conflictedNames.has(normalized)) continue;

      if (normalizedMap.has(normalized)) {
        normalizedMap.delete(normalized);
        conflictedNames.add(normalized);
      } else {
        normalizedMap.set(normalized, rec.id);
      }
    }

    return { normalizedMap, conflictedNames };
  }

  // Maps existing project assignments for fast lookup
  static buildAssignmentMap(records: AirtableRecord[]): Map<string, string> {
    const map = new Map<string, string>();

    for (const rec of records) {
      const projects = rec.fields[AIRTABLE_FIELDS.PROJECT] as
        | string[]
        | undefined;
      const month = rec.fields[AIRTABLE_FIELDS.MONTH] as string | undefined;

      if (projects && projects.length > 0 && month) {
        map.set(`${projects[0]}_${month}`, rec.id);
      }
    }

    return map;
  }

  // Identifies which assignments need to be generated based on the data
  static identifyMissingAssignments(
    sourceRows: AggregateRow[],
    existingMap: Map<string, string>,
  ): Map<string, { projectId: string; isoDate: string }> {
    const missing = new Map<string, { projectId: string; isoDate: string }>();

    for (const row of sourceRows) {
      if (!row.airtable_project_id) continue;

      const safeProjectId = row.airtable_project_id.trim();
      const isoDate = formatMonthToIsoDate(row.month);
      const key = `${safeProjectId}_${isoDate}`;

      if (!existingMap.has(key) && !missing.has(key)) {
        missing.set(key, { projectId: safeProjectId, isoDate });
      }
    }

    return missing;
  }
}
