import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIRTABLE_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";
import { AirtableService } from "./services/airtable.service.ts";
import { ReferenceSyncService } from "./services/reference-sync.service.ts";
import { SyncOrchestratorService } from "./services/sync-orchestrator.service.ts";
import { SyncController } from "./controller/sync.controller.ts";
import { withEdgeWrapper } from "../_shared/utils/edge.wrapper.ts";
import { ReferenceRepository } from "../_shared/repo/reference.repo.ts";
import { AggregateRepository } from "./repo/aggregate.repo.ts";

Deno.serve(withEdgeWrapper("Airtable-sync", async (req, slack) => {
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
  const refRepo = new ReferenceRepository(supabase);
  const aggregateRepo = new AggregateRepository(supabase);
  const airtable = new AirtableService(
    AIRTABLE_CONFIG.pat,
    AIRTABLE_CONFIG.baseId,
  );
  const referenceSync = new ReferenceSyncService(refRepo, airtable, slack);
  const orchestrator = new SyncOrchestratorService(
    slack,
    airtable,
    referenceSync,
    refRepo,
    aggregateRepo,
  );
  const controller = new SyncController(orchestrator);

  return controller.handleRequest(req);
}));
