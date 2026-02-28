import { SyncOrchestratorService } from "../services/sync-orchestrator.service.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";

export class SyncController {
  constructor(
    private readonly orchestrator: SyncOrchestratorService,
    private readonly slack: SlackService,
  ) {}

  async handleRequest(_req: Request): Promise<Response> {
    try {
      // Execute the multi-job sync
      const result = await this.orchestrator.runAllJobs();

      // Success Response
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`Airtable Sync Controller Error: ${error.message}`);

      // Send Slack Alert on top-level failure
      await this.slack.sendAlert(
        "Airtable Multi-Sync Orchestrator",
        error.message,
      );

      // Error Response
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }
}
