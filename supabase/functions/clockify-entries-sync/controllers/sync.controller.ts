import { SyncRequestSchema } from "../../_shared/types/sync.types.ts";
import { SyncService } from "../services/sync.service.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";

export class SyncController {
  constructor(private readonly service: SyncService) {}

  async handleRequest(req: Request): Promise<Response> {
    try {
      // 1. Parse & Validate Body
      let lookbackDays = 1;
      const rawText = await req.text();

      if (rawText.trim()) {
        try {
          const body = SyncRequestSchema.parse(JSON.parse(rawText));
          if (body.lookbackDays) {
            lookbackDays = body.lookbackDays;
          }
        } catch (err) {
          // Throw custom ValidationError
          throw new ValidationError(
            `Invalid sync payload: ${toSafeError(err).message}`,
          );
        }
      }

      // 2. Run the main sync logic
      const totalSynced = await this.service.syncRecentData(lookbackDays);

      if (totalSynced > 0) {
        await this.service.triggerAirtableSync();
      } else {
        console.log("No changes detected.");
      }

      return new Response(
        JSON.stringify({
          success: true,
          synced: totalSynced,
          mode: lookbackDays === 1 ? "FAST" : "DEEP",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: unknown) {
      const error = toSafeError(err);

      // Log the raw error internally for debugging
      console.error("Sync Error:", error.message);

      const isValidationError = error instanceof ValidationError;
      const status = isValidationError ? 400 : 500;

      // Sanitize the output sent to the client.
      const safeClientMessage = isValidationError
        ? error.message
        : "Internal server error.";

      return new Response(
        JSON.stringify({ success: false, error: safeClientMessage }),
        { status, headers: { "Content-Type": "application/json" } },
      );
    }
  }
}
