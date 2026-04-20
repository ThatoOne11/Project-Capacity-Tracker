import { z } from "npm:zod";

export const SlackBotActions = {
  UNASSIGNED_NUDGE: "unassigned_nudge",
} as const;

export const SlackBotPayloadSchema = z.object({
  action: z.enum(SlackBotActions),
  targetDate: z.string().optional(),
});

export type SlackBotPayload = z.infer<typeof SlackBotPayloadSchema>;
