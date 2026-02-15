import { BackfillService } from "../services/backfill.service.ts";

export class BackfillController {
  constructor(private readonly service: BackfillService) {}

  async handleRequest(req: Request): Promise<Response> {
    try {
      // 1. Parse Body (Handle empty body gracefully)
      const body = await req.json().catch(() => ({}));
      const startDate = body.startDate || "2026-01-01T00:00:00Z";
      const targetUserId = body.userId; // Optional

      // 2. Orchestrate the Sync
      // First, ensure we have the latest projects/clients
      await this.service.syncReferenceData();

      // Then, backfill the actual time entries
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
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }
}
