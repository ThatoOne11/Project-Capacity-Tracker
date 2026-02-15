import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { SupabaseRepository } from "../_shared/repo/supabase.repo.ts";
import { SyncService } from "./services/sync.service.ts";
import { SyncController } from "./controllers/sync.controller.ts";

// 1. Configuration
const ENV = {
  CLOCKIFY_KEY: Deno.env.get("CLOCKIFY_KEY")!,
  WORKSPACE_ID: Deno.env.get("WORKSPACE_ID")!,
  SUPABASE_URL: Deno.env.get("SUPABASE_URL")!,
  SUPABASE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
};

Deno.serve(async (_req) => {
  // 2. Dependency Injection (Wiring)
  const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_KEY);

  // Shared services/repos
  const clockifyService = new ClockifyService(
    ENV.CLOCKIFY_KEY,
    ENV.WORKSPACE_ID,
  );
  const repo = new SupabaseRepository(supabase);

  // Domain-specific service & controller
  const syncService = new SyncService(supabase, clockifyService, repo);
  const controller = new SyncController(syncService);

  // 3. Execute
  return await controller.handleRequest();
});
