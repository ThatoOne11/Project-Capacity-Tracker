import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { SyncController } from "./sync.controller.ts";
import { SyncService } from "../services/sync.service.ts";

Deno.test("SyncController - Zod Validation & HTTP Suite", async (t) => {
  // 1. Create a Mock Service
  const mockService = {
    syncRecentData: (days: number) => Promise.resolve(days * 10), // Pretend we synced 'days * 10' records
    triggerAirtableSync: () => Promise.resolve(),
  } as unknown as SyncService;

  const controller = new SyncController(mockService);

  await t.step(
    "1. It should default to lookbackDays: 1 (FAST mode) if body is empty",
    async () => {
      const req = new Request("https://mock-edge-function.com", {
        method: "POST",
      });
      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.mode, "FAST");
      assertEquals(body.synced, 10); // 1 day * 10
    },
  );

  await t.step(
    "2. It should accept lookbackDays: 30 (DEEP mode) for the 3am Audit",
    async () => {
      const req = new Request("https://mock-edge-function.com", {
        method: "POST",
        body: JSON.stringify({ lookbackDays: 30 }),
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.mode, "DEEP");
      assertEquals(body.synced, 300); // 30 days * 10
    },
  );

  await t.step(
    "3. It should REJECT (400) if lookbackDays is a string instead of a number",
    async () => {
      const req = new Request("https://mock-edge-function.com", {
        method: "POST",
        body: JSON.stringify({ lookbackDays: "30" }), // Invalid string
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 400);
      assertStringIncludes(body.error, "expected number, received string");
    },
  );
});
