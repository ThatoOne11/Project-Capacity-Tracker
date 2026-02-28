import { z } from "npm:zod";

export const AirtableRecordSchema = z.object({
  id: z.string(),
  // Explicitly tell Zod that the keys are strings, and the values are unknown
  fields: z.record(z.string(), z.unknown()).transform((fields) => ({
    "Name": typeof fields["Name"] === "string" ? fields["Name"] : "",
    "Actual Hours": typeof fields["Actual Hours"] === "number"
      ? fields["Actual Hours"]
      : 0,
  })),
});

export const AirtableResponseSchema = z.object({
  records: z.array(AirtableRecordSchema).optional(),
  offset: z.string().optional(),
});

export type AggregateRow = {
  user_name: string;
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
  fields: {
    "Actual Hours": number;
  };
};

export type AirtableInsert = {
  fields: {
    "User": string;
    "Project": string;
    "Month": string;
    "Actual Hours": number;
  };
};

export type SyncJob = {
  name: string;
  sourceView: string;
  destinationTableId: string;
  allowInserts: boolean;
};

export type AirtableRecord = z.infer<typeof AirtableRecordSchema>;
