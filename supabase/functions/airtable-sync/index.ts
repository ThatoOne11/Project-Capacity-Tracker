import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackService } from "../_shared/services/slack.service.ts";
import { AIRTABLE_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";
import { AirtableService } from "./services/airtable.service.ts";
import { ReferenceSyncService } from "./services/reference-sync.service.ts";
import { SyncOrchestratorService } from "./services/sync-orchestrator.service.ts";
import { SyncController } from "./controller/sync.controller.ts";
import { toSafeError } from "../_shared/utils/error.utils.ts";

Deno.serve(async (req: Request) => {
  const slack = new SlackService();

  try {
    const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

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
  } catch (err: unknown) {
    const error = toSafeError(err);

    console.error(`Airtable Sync Initialization Error: ${error.message}`);
    await slack.sendAlert("Airtable-sync Edge Function", error.message);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Initialization failed.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
