import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { ReferenceRepository } from "../_shared/repo/reference.repo.ts";
import { TimeEntryRepository } from "../_shared/repo/time-entry.repo.ts";
import { BackfillService } from "./services/backfill.service.ts";
import { BackfillController } from "./controller/backfill.controller.ts";
import { CLOCKIFY_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";
import { withEdgeWrapper } from "../_shared/utils/edge.wrapper.ts";

Deno.serve(withEdgeWrapper("Backfill-clockify", async (req, _slack) => {
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
  const clockifyService = new ClockifyService(
    CLOCKIFY_CONFIG.apiKey,
    CLOCKIFY_CONFIG.workspaceId,
  );
  const refRepo = new ReferenceRepository(supabase);
  const entryRepo = new TimeEntryRepository(supabase);

  const backfillService = new BackfillService(
    supabase,
    clockifyService,
    refRepo,
    entryRepo,
  );
  const controller = new BackfillController(backfillService);

  return await controller.handleRequest(req);
}));
