import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { SlackBotController } from "../controllers/slack-bot.controller.ts";
import { SlackBotOrchestrator } from "../services/slack-bot.orchestrator.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";
import { SlackBotPayload } from "../types/slack-bot.types.ts";

Deno.test("SlackBotController - Validation & HTTP Suite", async (t) => {
  // Mock the Orchestrator so we are ONLY testing the HTTP/Zod boundary
  const mockOrchestrator = {
    routeAction: (payload: SlackBotPayload) =>
      Promise.resolve({
        action: payload.action,
        success: true,
        details: "Mock success",
      }),
  } as unknown as SlackBotOrchestrator;

  const controller = new SlackBotController(mockOrchestrator);

  await t.step(
    "1. Throws ValidationError on completely empty payload",
    async () => {
      const req = new Request("https://mock.com", { method: "POST", body: "" });

      try {
        await controller.handleRequest(req);
        throw new Error("Expected a ValidationError to be thrown");
      } catch (err) {
        assertEquals(err instanceof ValidationError, true);
        assertStringIncludes(
          (err as ValidationError).message,
          "Empty payload provided.",
        );
      }
    },
  );

  await t.step("2. Throws ValidationError on invalid action enum", async () => {
    const req = new Request("https://mock.com", {
      method: "POST",
      body: JSON.stringify({ action: "hack_the_mainframe" }),
    });

    try {
      await controller.handleRequest(req);
      throw new Error("Expected a ValidationError to be thrown");
    } catch (err) {
      assertEquals(err instanceof ValidationError, true);
      assertStringIncludes((err as ValidationError).message, "Invalid payload");
    }
  });

  await t.step(
    "3. Returns 200 OK for a valid unassigned_nudge action",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({ action: "unassigned_nudge" }),
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.action, "unassigned_nudge");
    },
  );
});
