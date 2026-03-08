import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { TimeEntryRepository } from "../_shared/repo/time-entry.repo.ts";
import { ReferenceRepository } from "../_shared/repo/reference.repo.ts";
import { SlackService } from "../_shared/services/slack.service.ts";
import { SyncService } from "./services/sync.service.ts";
import { UserEntrySyncer } from "./services/user-entry.syncer.ts";
import { SyncController } from "./controllers/sync.controller.ts";
import { CLOCKIFY_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";
import { ReferenceSyncer } from "./services/reference.syncer.ts";

Deno.serve(async (req) => {
  const slack = new SlackService();

  try {
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
  } catch (err: unknown) {
    const error = err as Error;
    console.error(
      `[Clockify-entries-sync] Initialization Error: ${error.message}`,
    );

    await slack.sendAlert("[Clockify-entries-sync]", error.message);

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
