import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackService } from "../_shared/services/slack.service.ts";
import { SUPABASE_CONFIG } from "../_shared/config.ts";
import { SyncOrchestratorService } from "./services/sync-orchestrator.service.ts";
import { SyncController } from "./controller/sync.controller.ts";

Deno.serve(async (req: Request) => {
  // 1. Initialize Clients
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
  const slack = new SlackService();

  // 2. Initialize Domain Logic (Dependency Injection)
  const orchestratorService = new SyncOrchestratorService(supabase, slack);
  const controller = new SyncController(orchestratorService, slack);

  // 3. Handle Request
  return await controller.handleRequest(req);
});
