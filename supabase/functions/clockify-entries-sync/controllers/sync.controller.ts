import { SyncService } from "../services/sync.service.ts";

export class SyncController {
  constructor(private readonly service: SyncService) {}

  async handleRequest(): Promise<Response> {
    try {
      // 1. Run the main sync logic
      const totalSynced = await this.service.syncRecentData();

      // 2. Decide if we need to trigger the next step
      if (totalSynced > 0) {
        await this.service.triggerAirtableSync();
      } else {
        console.log("No changes detected.");
      }

      // 3. Return Success Response
      return new Response(
        JSON.stringify({ success: true, synced: totalSynced }),
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
