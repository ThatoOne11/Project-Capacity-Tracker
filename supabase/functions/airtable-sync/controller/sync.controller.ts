import { SyncOrchestratorService } from "../services/sync-orchestrator.service.ts";

export class SyncController {
  constructor(private readonly orchestrator: SyncOrchestratorService) {}

  async handleRequest(_req: Request): Promise<Response> {
    const result = await this.orchestrator.runAllJobs();

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
