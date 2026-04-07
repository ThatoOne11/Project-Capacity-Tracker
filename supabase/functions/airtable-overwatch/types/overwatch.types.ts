import { z } from "npm:zod";

export const OverwatchRequestSchema = z.object({
  tableId: z.string().min(1, "tableId is required"),
  filterByFormula: z.string().optional(),
  maxRecords: z.number().int().positive().optional(),
  fields: z.array(z.string()).optional(),
});

export type OverwatchRequest = z.infer<typeof OverwatchRequestSchema>;
