import { AIRTABLE_CONFIG } from "../_shared/config.ts";
import { withEdgeWrapper } from "../_shared/utils/edge.wrapper.ts";
import { OverwatchService } from "./services/overwatch.service.ts";
import { OverwatchController } from "./controllers/overwatch.controller.ts";

Deno.serve(withEdgeWrapper("Airtable-Overwatch", async (req, _slack) => {
  const overwatchService = new OverwatchService(
    AIRTABLE_CONFIG.pat,
    AIRTABLE_CONFIG.baseId,
  );

  const controller = new OverwatchController(overwatchService);

  return controller.handleRequest(req);
}));
