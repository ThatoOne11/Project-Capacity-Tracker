import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIRTABLE_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";
import { AirtableService } from "./services/airtable.service.ts";
import { ReferenceSyncService } from "./services/reference-sync.service.ts";
import { SyncOrchestratorService } from "./services/sync-orchestrator.service.ts";
import { SyncController } from "./controller/sync.controller.ts";
import { withEdgeWrapper } from "../_shared/utils/edge.wrapper.ts";
import { ReferenceRepository } from "../_shared/repo/reference.repo.ts";

Deno.serve(withEdgeWrapper("Airtable-sync", async (req, slack) => {
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
  const airtable = new AirtableService(
    AIRTABLE_CONFIG.pat,
    AIRTABLE_CONFIG.baseId,
  );
  const referenceSync = new ReferenceSyncService(supabase, airtable, slack);
  const refRepo = new ReferenceRepository(supabase);

  const orchestratorService = new SyncOrchestratorService(
    supabase,
    slack,
    airtable,
    referenceSync,
    refRepo,
  );
  const controller = new SyncController(orchestratorService, slack);

  return await controller.handleRequest(req);
}));
