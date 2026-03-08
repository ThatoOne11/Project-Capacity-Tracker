import { z } from "npm:zod";
import { SyncStrategy } from "../constants/sync.consts.ts";

export const AirtableRecordSchema = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
});

export const AirtableResponseSchema = z.object({
  records: z.array(AirtableRecordSchema).optional(),
  offset: z.string().optional(),
});
export type AirtableRecord = z.infer<typeof AirtableRecordSchema>;

export type AirtableUpdate = {
  id: string;
  fields: Record<string, unknown>;
};

export type AirtableInsert = {
  fields: Record<string, unknown>;
};

export type SyncStats = {
  updated: number;
  inserted: number;
  skipped: number;
  missing: number;
};

export type SyncJob = {
  name: string;
  sourceView: string;
  destinationTableId: string;
  allowInserts: boolean;
  strategy: SyncStrategy;
};

export type DiffContext = {
  updates: AirtableUpdate[];
  inserts: AirtableInsert[];
  stats: SyncStats;
  touchedAirtableIds: Set<string>;
  job: SyncJob;
  projectAssignmentMap: Map<string, string>;
};
