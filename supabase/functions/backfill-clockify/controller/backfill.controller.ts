import { BackfillService } from "../services/backfill.service.ts";
import {
  BackfillRequestBody,
  BackfillRequestSchema,
  DEFAULT_BACKFILL_START_DATE,
} from "../types/types.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";

export class BackfillController {
  constructor(private readonly service: BackfillService) {}

  async handleRequest(req: Request): Promise<Response> {
    let body: BackfillRequestBody = {};
    const rawText = await req.text();

    if (rawText.trim()) {
      try {
        body = BackfillRequestSchema.parse(JSON.parse(rawText));
      } catch (err) {
        throw new ValidationError(
          `Invalid JSON payload: ${toSafeError(err).message}`,
        );
      }
    }

    const startDate = body.startDate ?? DEFAULT_BACKFILL_START_DATE;

    await this.service.syncReferenceData();
    const totalSynced = await this.service.syncTimeEntries(
      startDate,
      body.userId,
    );

    return new Response(
      JSON.stringify({ success: true, synced: totalSynced }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
}
