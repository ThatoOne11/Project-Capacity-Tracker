import { BackfillService } from "../services/backfill.service.ts";
import { BackfillRequestBody, BackfillRequestSchema } from "../types/types.ts";

export class BackfillController {
  constructor(private readonly service: BackfillService) {}

  async handleRequest(req: Request): Promise<Response> {
    try {
      // 1. Parse & Validate Body
      let body: BackfillRequestBody = {};
      const rawText = await req.text();

      if (rawText.trim()) {
        try {
          // Zod automatically throws a highly descriptive error if this fails!
          body = BackfillRequestSchema.parse(JSON.parse(rawText));
        } catch (err) {
          throw new Error(`Invalid JSON payload: ${(err as Error).message}`);
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
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Backfill Failed:", error.message);

      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }, // 400 Bad Request is more accurate here
      );
    }
  }
}
