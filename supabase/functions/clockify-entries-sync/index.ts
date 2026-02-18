import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { TimeEntryRepository } from "../_shared/repo/time-entry.repo.ts";
import { ReferenceRepository } from "../_shared/repo/reference.repo.ts";
import { SlackService } from "../_shared/services/slack.service.ts";
import { SyncService } from "./services/sync.service.ts";
import { UserEntrySyncer } from "./services/user-entry.syncer.ts";
import { SyncController } from "./controllers/sync.controller.ts";
import { CLOCKIFY_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

  // 1. Shared Services & Repos
  const clockifyService = new ClockifyService(
    CLOCKIFY_CONFIG.apiKey,
    CLOCKIFY_CONFIG.workspaceId,
  );
  const slack = new SlackService();
  const timeEntryRepo = new TimeEntryRepository(supabase);
  const refRepo = new ReferenceRepository(supabase);

  // 2. Domain Specific Logic & Main Orchestrator
  const userSyncer = new UserEntrySyncer(clockifyService, timeEntryRepo);
  const syncService = new SyncService(refRepo, userSyncer, slack);
  const controller = new SyncController(syncService);

  // 3. Execute
  return await controller.handleRequest(req);
});
