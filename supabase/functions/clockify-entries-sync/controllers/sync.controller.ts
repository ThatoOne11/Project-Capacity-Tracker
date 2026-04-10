import { SyncRequestSchema } from "../../_shared/types/sync.types.ts";
import { SyncService } from "../services/sync.service.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";

export class SyncController {
  constructor(private readonly service: SyncService) {}

  async handleRequest(req: Request): Promise<Response> {
    let lookbackDays = 1;
    const rawText = await req.text();

    if (rawText.trim()) {
      try {
        const body = SyncRequestSchema.parse(JSON.parse(rawText));
        if (body.lookbackDays) lookbackDays = body.lookbackDays;
      } catch (err) {
        const message = `Invalid sync payload: ${toSafeError(err).message}`;
        throw new ValidationError(message);
      }
    }

    const { totalSynced, mode } = await this.service.runSync(lookbackDays);

    return new Response(
      JSON.stringify({ success: true, synced: totalSynced, mode }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
}
