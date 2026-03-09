import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { ReferenceRepository } from "../_shared/repo/reference.repo.ts";
import { TimeEntryRepository } from "../_shared/repo/time-entry.repo.ts";
import { BackfillService } from "./services/backfill.service.ts";
import { BackfillController } from "./controller/backfill.controller.ts";
import { CLOCKIFY_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";
import { SlackService } from "../_shared/services/slack.service.ts";
import { toSafeError } from "../_shared/utils/error.utils.ts";
import { requireServiceRole } from "../_shared/utils/auth.utils.ts";

Deno.serve(async (req: Request) => {
  const authError = requireServiceRole(req);
  if (authError) return authError;

  const slack = new SlackService();

  try {
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
  } catch (err: unknown) {
    const error = toSafeError(err);

    console.error(`[Backfill-clockify] Initialization Error: ${error.message}`);

    await slack.sendAlert("Backfill-clockify Edge Function", error.message);

    return new Response(
      JSON.stringify({ success: false, error: "Initialization failed." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
