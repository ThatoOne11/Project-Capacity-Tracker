import { z } from "npm:zod";

export const AirtableRecordSchema = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
});

export const AirtableResponseSchema = z.object({
  records: z.array(AirtableRecordSchema).optional(),
  offset: z.string().optional(),
});

export type AggregateRow = {
  airtable_user_id: string | null;
  user_name: string;
  airtable_project_id: string | null;
  project_name: string;
  month: string;
  total_hours: string;
};

export type SyncStats = {
  updated: number;
  inserted: number;
  skipped: number;
  missing: number;
};

export type AirtableUpdate = {
  id: string;
  fields: { "Actual Hours": number };
};

export type AirtableInsert = {
  fields: {
    User: string[];
    Project: string[];
    Month: string;
    "Actual Hours": number;
  };
};

export type SyncJob = {
  name: string;
  sourceView: string;
  destinationTableId: string;
  allowInserts: boolean;
  strategy: "PAYROLL" | "ASSIGNMENT"; // Dictates which columns and logic to use
};

export type DiffContext = {
  updates: AirtableUpdate[];
  inserts: AirtableInsert[];
  stats: SyncStats;
  touchedAirtableIds: Set<string>;
  job: SyncJob;
  projectAssignmentMap: Map<string, string>;
};

export type ViewRow = {
  user_name: string | null;
  project_name: string | null;
};

export type ReferenceRecord = {
  id: string;
  name: string;
};

export type AirtableRecord = z.infer<typeof AirtableRecordSchema>;
