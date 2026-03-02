import { z } from "npm:zod";

export const BackfillRequestSchema = z.object({
  startDate: z.iso.datetime().optional(),
  userId: z.string().optional(),
});

export type BackfillRequestBody = z.infer<typeof BackfillRequestSchema>;
