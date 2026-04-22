import { SlackBotPayloadSchema } from "../types/slack-bot.types.ts";
import { SlackBotOrchestrator } from "../services/slack-bot.orchestrator.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";

export class SlackBotController {
  constructor(private readonly orchestrator: SlackBotOrchestrator) {}

  async handleRequest(req: Request): Promise<Response> {
    const rawText = await req.text();

    if (!rawText.trim()) throw new ValidationError("Empty payload provided.");

    try {
      const payload = SlackBotPayloadSchema.parse(JSON.parse(rawText));
      const result = await this.orchestrator.routeAction(payload);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      throw new ValidationError(`Invalid payload: ${toSafeError(err).message}`);
    }
  }
}
