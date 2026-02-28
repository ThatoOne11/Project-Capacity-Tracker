import { z } from "npm:zod";

// 1. Define the Schema (The Runtime Bouncer)
export const BackfillRequestSchema = z.object({
  // Ensures it's a string. You can even add .datetime() if you want to strictly enforce ISO8601 formats!
  startDate: z.string().optional(),
  userId: z.string().optional(),
});

// 2. Automatically generate the TypeScript type from the Schema
export type BackfillRequestBody = z.infer<typeof BackfillRequestSchema>;
