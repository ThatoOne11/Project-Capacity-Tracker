import { z } from "npm:zod";

export const DEFAULT_BACKFILL_START_DATE = "2026-01-01T00:00:00Z";

export const BackfillRequestSchema = z.object({
  startDate: z.iso.datetime().optional(),
  userId: z.string().optional(),
});

export type BackfillRequestBody = z.infer<typeof BackfillRequestSchema>;
