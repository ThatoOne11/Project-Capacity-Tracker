import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { TimeEntryRepository } from "../_shared/repo/time-entry.repo.ts";
import { SyncService } from "./services/sync.service.ts";
import { SyncController } from "./controllers/sync.controller.ts";
import { CLOCKIFY_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";
import { SlackService } from "../_shared/services/slack.service.ts";

Deno.serve(async (req) => {
  // 1. Initialize Clients
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

  // 2. Initialize Shared Modules
  const clockifyService = new ClockifyService(
    CLOCKIFY_CONFIG.apiKey,
    CLOCKIFY_CONFIG.workspaceId,
  );

  const slack = new SlackService();
  const timeEntryRepo = new TimeEntryRepository(supabase);

  // Domain-specific service & controller
  const syncService = new SyncService(
    supabase,
    clockifyService,
    timeEntryRepo,
    slack,
  );
  const controller = new SyncController(syncService);

  // 3. Execute
  return await controller.handleRequest(req);
});
