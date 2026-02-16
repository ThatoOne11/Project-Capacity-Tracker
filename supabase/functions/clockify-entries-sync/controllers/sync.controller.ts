import { SyncService } from "../services/sync.service.ts";

export class SyncController {
  constructor(private readonly service: SyncService) {}

  async handleRequest(req: Request): Promise<Response> {
    try {
      // 1. Parse Body (Handle empty body gracefully for the 15-min cron)
      let lookbackDays = 1;
      try {
        const body = await req.json();
        if (body && typeof body.lookbackDays === "number") {
          lookbackDays = body.lookbackDays;
        }
      } catch {
        // If Body is empty, keep default (1 day)
      }

      // 2. Run the main sync logic with the specific timeframe
      const totalSynced = await this.service.syncRecentData(lookbackDays);

      if (totalSynced > 0) {
        await this.service.triggerAirtableSync();
      } else {
        console.log("No changes detected.");
      }

      // Success Response
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
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }
}
