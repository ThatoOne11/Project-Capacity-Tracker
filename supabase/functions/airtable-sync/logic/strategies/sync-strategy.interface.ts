import { AggregateRow } from "../../types/sync.types.ts";
import { AirtableRecord, DiffContext } from "../../types/airtable.types.ts";

export interface AirtableSyncStrategy {
  // Generates a unique key from an existing Airtable record to build the lookup map
  buildMapKey(record: AirtableRecord): string;

  // Determines if a Supabase row should be completely ignored (e.g. unassigned time)
  shouldSkipRow(row: AggregateRow): boolean;

  // Generates the matching lookup key for a Supabase row to find its Airtable counterpart
  buildLookupKey(row: AggregateRow, context: DiffContext): string;

  // Builds the field payload for a brand new Airtable record (Returns null if it should abort)
  buildInsertFields(
    row: AggregateRow,
    supabaseHours: number,
    context: DiffContext,
  ): Record<string, unknown> | null;

  // Checks if an Airtable record needs updating, and returns the payload (Returns null if no update needed)
  buildUpdateFields(
    match: AirtableRecord,
    supabaseHours: number,
    context: DiffContext,
  ): Record<string, unknown> | null;
}
