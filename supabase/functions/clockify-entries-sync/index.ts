import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { SupabaseRepository } from "../_shared/repo/supabase.repo.ts";
import { SyncService } from "./services/sync.service.ts";
import { SyncController } from "./controllers/sync.controller.ts";
import { CLOCKIFY_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";

Deno.serve(async (_req) => {
  // 1. Initialize Clients
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

  // 2. Initialize Shared Modules
  const clockifyService = new ClockifyService(
    CLOCKIFY_CONFIG.apiKey,
    CLOCKIFY_CONFIG.workspaceId,
  );

  const repo = new SupabaseRepository(supabase);

  // Domain-specific service & controller
  const syncService = new SyncService(supabase, clockifyService, repo);
  const controller = new SyncController(syncService);

  // 3. Execute
  return await controller.handleRequest();
});
