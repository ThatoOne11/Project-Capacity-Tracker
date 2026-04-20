import { SlackBotActions, SlackBotPayload } from "../types/slack-bot.types.ts";
import { UnassignedNudgeService } from "./unassigned-nudge.service.ts";

export class SlackBotOrchestrator {
  constructor(private readonly nudgeService: UnassignedNudgeService) {}

  async routeAction(
    payload: SlackBotPayload,
  ): Promise<{ action: string; success: boolean; details: string }> {
    console.log(`[SlackBotOrchestrator] Routing action: ${payload.action}`);

    // Default to today if no manual override is provided
    const targetDate = payload.targetDate ||
      new Date().toISOString().split("T")[0];

    switch (payload.action) {
      case SlackBotActions.UNASSIGNED_NUDGE: {
        const nudgedCount = await this.nudgeService.execute(targetDate);
        return {
          action: payload.action,
          success: true,
          details: `Successfully nudged ${nudgedCount} users.`,
        };
      }
      default:
        throw new Error(`Action '${payload.action}' is not implemented.`);
    }
  }
}
