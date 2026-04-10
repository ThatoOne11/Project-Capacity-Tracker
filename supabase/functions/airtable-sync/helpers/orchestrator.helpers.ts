import { AirtableUpdate } from "../types/airtable.types.ts";
import {
  AIRTABLE_RECORD_ID_PATTERN,
  GHOST_ERROR_TYPES,
} from "../constants/airtable.constants.ts";

export class OrchestratorHelpers {
  // Deduplicates updates to prevent Airtable API batch rejection.
  // Last-write-wins if multiple updates target the same record ID.
  static deduplicateUpdates(updates: AirtableUpdate[]): AirtableUpdate[] {
    const uniqueUpdatesMap = new Map<string, AirtableUpdate>();

    for (const update of updates) {
      uniqueUpdatesMap.set(update.id, update);
    }

    return Array.from(uniqueUpdatesMap.values());
  }

  // Inspects an error to see if it matches the Dictionary, and extracts the 17-char ID
  static extractGhostRecordId(error: Error): string | null {
    const isGhostError = GHOST_ERROR_TYPES.some((type) =>
      error.message.includes(type)
    );

    if (!isGhostError) return null;

    const match = AIRTABLE_RECORD_ID_PATTERN.exec(error.message);
    return match ? match[0] : null;
  }
}
