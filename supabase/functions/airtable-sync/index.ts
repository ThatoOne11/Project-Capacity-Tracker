import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackService } from "../_shared/services/slack.service.ts";
import { AIRTABLE_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";
import { AirtableService } from "./services/airtable.service.ts";
import { ReferenceSyncService } from "./services/reference-sync.service.ts";
import { SyncOrchestratorService } from "./services/sync-orchestrator.service.ts";
import { SyncController } from "./controller/sync.controller.ts";

Deno.serve(async (req: Request) => {
  // 1. Initialize Clients
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
  const slack = new SlackService();

  // Dependency Injection
  const airtable = new AirtableService(
    AIRTABLE_CONFIG.pat,
    AIRTABLE_CONFIG.baseId,
  );
  const referenceSync = new ReferenceSyncService(supabase, airtable);
  const orchestratorService = new SyncOrchestratorService(
    supabase,
    slack,
    airtable,
    referenceSync,
  );
  const controller = new SyncController(orchestratorService, slack);

  return await controller.handleRequest(req);
});
