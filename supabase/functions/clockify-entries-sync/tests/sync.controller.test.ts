import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { SyncService } from "../services/sync.service.ts";
import { SyncController } from "../controllers/sync.controller.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";

Deno.test("SyncController - Validation & HTTP Suite", async (t) => {
  const mockService = {
    runSync: (days: number) =>
      Promise.resolve({
        totalSynced: days * 10,
        mode: days === 1 ? "FAST" : "DEEP",
      }),
  } as unknown as SyncService;

  const controller = new SyncController(mockService);

  await t.step(
    "1. Defaults to lookbackDays: 1 (FAST mode) when body is empty",
    async () => {
      const req = new Request("https://mock.com", { method: "POST" });
      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.mode, "FAST");
      assertEquals(body.synced, 10);
    },
  );

  await t.step(
    "2. Accepts lookbackDays: 30 and returns DEEP mode",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({ lookbackDays: 30 }),
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.mode, "DEEP");
      assertEquals(body.synced, 300);
    },
  );

  await t.step(
    "3. Throws ValidationError if lookbackDays is a string instead of a number",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({ lookbackDays: "30" }),
      });

      try {
        await controller.handleRequest(req);
        throw new Error("Expected a ValidationError to be thrown");
      } catch (err) {
        const isValidation = err instanceof ValidationError;
        assertEquals(isValidation, true);
        assertStringIncludes(
          (err as ValidationError).message,
          "expected number, received string",
        );
      }
    },
  );
});
