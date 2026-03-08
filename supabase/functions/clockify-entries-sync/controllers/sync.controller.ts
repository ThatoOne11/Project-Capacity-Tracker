import { SyncRequestSchema } from "../../_shared/types/sync.types.ts";
import { SyncService } from "../services/sync.service.ts";

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
          throw new Error(`Invalid sync payload: ${(err as Error).message}`);
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
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Sync Error:", error.message);

      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }
}
