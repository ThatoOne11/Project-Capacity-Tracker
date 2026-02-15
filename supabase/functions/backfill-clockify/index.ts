import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { SupabaseRepository } from "../_shared/repo/supabase.repo.ts";
import { BackfillService } from "./services/backfill.service.ts";
import { BackfillController } from "./controller/backfill.controller.ts";
import { CLOCKIFY_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";

Deno.serve(async (req: Request) => {
  // 1. Initialize Clients
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

  // 2. Initialize Shared Modules
  const clockifyService = new ClockifyService(
    CLOCKIFY_CONFIG.apiKey,
    CLOCKIFY_CONFIG.workspaceId,
  );

  const repo = new SupabaseRepository(supabase);

  // 3. Initialize Domain Logic (Dependency Injection)
  const backfillService = new BackfillService(supabase, clockifyService, repo);
  const controller = new BackfillController(backfillService);

  // 4. Handle Request
  return await controller.handleRequest(req);
});
