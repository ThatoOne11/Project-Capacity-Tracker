import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_CONFIG } from "../_shared/config.ts";
import { withEdgeWrapper } from "../_shared/utils/edge.wrapper.ts";
import { TimeEntryRepository } from "../_shared/repo/time-entry.repo.ts";
import { ReferenceRepository } from "../_shared/repo/reference.repo.ts";
import { UnassignedNudgeService } from "./services/unassigned-nudge.service.ts";
import { SlackBotOrchestrator } from "./services/slack-bot.orchestrator.ts";
import { SlackBotController } from "./controllers/slack-bot.controller.ts";

Deno.serve(withEdgeWrapper("Slack-Bot-Router", async (req, slack) => {
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

  const timeRepo = new TimeEntryRepository(supabase);
  const refRepo = new ReferenceRepository(supabase);

  const nudgeService = new UnassignedNudgeService(timeRepo, refRepo, slack);
  const orchestrator = new SlackBotOrchestrator(nudgeService);
  const controller = new SlackBotController(orchestrator);

  return await controller.handleRequest(req);
}));
