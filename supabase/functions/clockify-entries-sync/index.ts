import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { TimeEntryRepository } from "../_shared/repo/time-entry.repo.ts";
import { ReferenceRepository } from "../_shared/repo/reference.repo.ts";
import { SyncService } from "./services/sync.service.ts";
import { UserEntrySyncer } from "./services/user-entry.syncer.ts";
import { SyncController } from "./controllers/sync.controller.ts";
import { CLOCKIFY_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";
import { ReferenceSyncer } from "./services/reference.syncer.ts";
import { withEdgeWrapper } from "../_shared/utils/edge.wrapper.ts";

Deno.serve(withEdgeWrapper("Clockify-entries-sync", async (req, slack) => {
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
  const clockifyService = new ClockifyService(
    CLOCKIFY_CONFIG.apiKey,
    CLOCKIFY_CONFIG.workspaceId,
  );
  const timeEntryRepo = new TimeEntryRepository(supabase);
  const refRepo = new ReferenceRepository(supabase);

  const userSyncer = new UserEntrySyncer(clockifyService, timeEntryRepo);
  const refSyncer = new ReferenceSyncer(clockifyService, refRepo);
  const syncService = new SyncService(refRepo, userSyncer, refSyncer, slack);
  const controller = new SyncController(syncService);

  return await controller.handleRequest(req);
}));
