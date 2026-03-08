import { AIRTABLE_FIELDS } from "../../constants/airtable.constants.ts";
import { AggregateRow } from "../../types/sync.types.ts";
import { AirtableRecord, DiffContext } from "../../types/airtable.types.ts";
import { AirtableSyncStrategy } from "./sync-strategy.interface.ts";

export class AssignmentStrategy implements AirtableSyncStrategy {
  buildMapKey(record: AirtableRecord): string {
    const persons = record.fields[AIRTABLE_FIELDS.PERSON] as
      | string[]
      | undefined;
    const projAssignments = record.fields[AIRTABLE_FIELDS.PROJECT_ASSIGNMENT] as
      | string[]
      | undefined;

    const personId = persons?.[0] || "no_person";
    const projectAssignmentId = projAssignments?.[0] || `orphan_${record.id}`;

    return `${personId}_${projectAssignmentId}`;
  }

  shouldSkipRow(row: AggregateRow): boolean {
    return !row.airtable_project_id; // People Assignments ignore unassigned time completely
  }

  buildLookupKey(row: AggregateRow, context: DiffContext): string {
    const safeUserId = row.airtable_user_id?.trim() || "no_user";
    const safeProjectId = row.airtable_project_id?.trim() || "no_project";

    const isoDate = this.formatMonthToIsoDate(row.month);
    const projectAssignmentKey = `${safeProjectId}_${isoDate}`;
    const projectAssignmentId = context.projectAssignmentMap.get(
      projectAssignmentKey,
    );

    return projectAssignmentId
      ? `${safeUserId}_${projectAssignmentId}`
      : `unmatchable_${safeUserId}_${isoDate}`;
  }

  buildInsertFields(
    row: AggregateRow,
    supabaseHours: number,
    context: DiffContext,
  ): Record<string, unknown> | null {
    const safeUserId = row.airtable_user_id!.trim();
    const safeProjectId = row.airtable_project_id?.trim() || null;

    const isoDate = this.formatMonthToIsoDate(row.month);
    const projectAssignmentKey = `${safeProjectId}_${isoDate}`;
    const projectAssignmentId = context.projectAssignmentMap.get(
      projectAssignmentKey,
    );

    if (!projectAssignmentId) {
      console.warn(
        `[DiffCalculator] Skipping insert for ${row.user_name}: Missing Project Assignment for ${row.month}`,
      );
      return null; // Signals the engine to abort this row
    }

    return {
      [AIRTABLE_FIELDS.PERSON]: [safeUserId],
      [AIRTABLE_FIELDS.PROJECT_ASSIGNMENT]: [projectAssignmentId],
      [AIRTABLE_FIELDS.ACTUAL_HOURS]: supabaseHours,
      [AIRTABLE_FIELDS.ASSIGNED_HOURS]: 0,
    };
  }

  buildUpdateFields(
    match: AirtableRecord,
    supabaseHours: number,
    _context: DiffContext,
  ): Record<string, unknown> | null {
    const rawAirtableHours = match.fields[AIRTABLE_FIELDS.ACTUAL_HOURS];
    const airtableHours = typeof rawAirtableHours === "number"
      ? rawAirtableHours
      : 0;

    const hasChanged = Math.abs(supabaseHours - airtableHours) > 0.01;
    const isBlankButShouldBeZero = supabaseHours === 0 &&
      rawAirtableHours === undefined;

    // Auto-heal missing assigned hours to prevent formula crashes
    const rawAssignedHours = match.fields[AIRTABLE_FIELDS.ASSIGNED_HOURS];
    const needsAssignedZero = rawAssignedHours === undefined;

    if (hasChanged || isBlankButShouldBeZero || needsAssignedZero) {
      const fields: Record<string, unknown> = {};

      if (hasChanged || isBlankButShouldBeZero) {
        fields[AIRTABLE_FIELDS.ACTUAL_HOURS] = supabaseHours;
      }
      if (needsAssignedZero) {
        fields[AIRTABLE_FIELDS.ASSIGNED_HOURS] = 0;
      }

      return fields;
    }

    return null;
  }

  private formatMonthToIsoDate(monthString: string): string {
    const [monthName, year] = monthString.split(" ");
    const monthIndex = new Date(`${monthName} 1, 2000`).getMonth() + 1;
    return `${year}-${monthIndex.toString().padStart(2, "0")}-01`;
  }
}
