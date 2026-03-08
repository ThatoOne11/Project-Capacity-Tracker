import { AIRTABLE_FIELDS } from "../../constants/airtable.constants.ts";
import { AggregateRow } from "../../types/sync.types.ts";
import { AirtableRecord, DiffContext } from "../../types/airtable.types.ts";
import { AirtableSyncStrategy } from "./sync-strategy.interface.ts";

export class PayrollStrategy implements AirtableSyncStrategy {
  buildMapKey(record: AirtableRecord): string {
    const users = record.fields[AIRTABLE_FIELDS.USER] as string[] | undefined;
    const projects = record.fields[AIRTABLE_FIELDS.PROJECT] as
      | string[]
      | undefined;
    const month = record.fields[AIRTABLE_FIELDS.MONTH] as string | undefined;

    const userId = users?.[0] || "no_user";
    const projectId = projects?.[0] || "no_project";

    return `${userId}_${projectId}_${month || ""}`;
  }

  shouldSkipRow(_row: AggregateRow): boolean {
    return false; // Payroll must process unassigned time
  }

  buildLookupKey(row: AggregateRow, _context: DiffContext): string {
    const safeUserId = row.airtable_user_id?.trim() || "no_user";
    const safeProjectId = row.airtable_project_id?.trim() || "no_project";

    return `${safeUserId}_${safeProjectId}_${row.month}`;
  }

  buildInsertFields(
    row: AggregateRow,
    supabaseHours: number,
    _context: DiffContext,
  ): Record<string, unknown> | null {
    const safeUserId = row.airtable_user_id!.trim();
    const safeProjectId = row.airtable_project_id?.trim() || null;

    return {
      [AIRTABLE_FIELDS.USER]: [safeUserId],
      [AIRTABLE_FIELDS.PROJECT]: safeProjectId ? [safeProjectId] : [],
      [AIRTABLE_FIELDS.MONTH]: row.month,
      [AIRTABLE_FIELDS.ACTUAL_HOURS]: supabaseHours,
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

    if (hasChanged || isBlankButShouldBeZero) {
      return { [AIRTABLE_FIELDS.ACTUAL_HOURS]: supabaseHours };
    }

    return null;
  }
}
