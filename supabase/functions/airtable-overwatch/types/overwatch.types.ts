import { z } from "npm:zod";

export const OverwatchRequestSchema = z.object({
  tableId: z.string().min(1, "tableId is required"),
  filterByFormula: z.string().optional(),
  maxRecords: z.number().int().positive().max(100_000).optional(), // Airtable's maxi is 100,000 records per base scan.
  fields: z.array(z.string()).optional(),
});

export type OverwatchRequest = z.infer<typeof OverwatchRequestSchema>;

export type OverwatchResult = {
  records: unknown[];
};
