import { BackfillService } from "../services/backfill.service.ts";
import { BackfillRequestBody, BackfillRequestSchema } from "../types/types.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";

export class BackfillController {
  constructor(private readonly service: BackfillService) {}

  async handleRequest(req: Request): Promise<Response> {
    try {
      // 1. Parse & Validate Body
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

      // Default to Jan 1st if no valid string was provided
      const startDate = body.startDate || "2026-01-01T00:00:00Z";
      const targetUserId = body.userId;

      // 2. Orchestrate the Sync
      await this.service.syncReferenceData();
      const totalSynced = await this.service.syncTimeEntries(
        startDate,
        targetUserId,
      );

      // 3. Success Response
      return new Response(
        JSON.stringify({ success: true, synced: totalSynced }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: unknown) {
      const error = toSafeError(err);

      console.error("Backfill Failed:", error.message);

      const isValidationError = error instanceof ValidationError;
      const status = isValidationError ? 400 : 500;

      // Sanitize output
      const safeClientMessage = isValidationError
        ? error.message
        : "Internal server error";

      return new Response(
        JSON.stringify({ success: false, error: safeClientMessage }),
        { status, headers: { "Content-Type": "application/json" } },
      );
    }
  }
}
