import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { BackfillController } from "./backfill.controller.ts";
import { BackfillService } from "../services/backfill.service.ts";

Deno.test("BackfillController - Zod Validation & HTTP Suite", async (t) => {
  // 1. Create a "Mock" Service that does fake work instantly
  const mockService = {
    syncReferenceData: () => Promise.resolve(),
    // Always pretend we successfully synced 42 records
    syncTimeEntries: (_startDate: string, _userId?: string) =>
      Promise.resolve(42),
  } as unknown as BackfillService;

  const controller = new BackfillController(mockService);

  await t.step(
    "1. It should return 200 and default to Jan 1st if body is empty",
    async () => {
      // Simulate a completely empty POST request
      const req = new Request("https://mock-edge-function.com", {
        method: "POST",
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.synced, 42); // Proves our mock service was called!
    },
  );

  await t.step(
    "2. It should return 200 for a perfectly formatted payload",
    async () => {
      const validPayload = {
        startDate: "2026-02-01T00:00:00Z",
        userId: "user_123",
      };
      const req = new Request("https://mock-edge-function.com", {
        method: "POST",
        body: JSON.stringify(validPayload),
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.success, true);
    },
  );

  await t.step(
    "3. It should REJECT (400) if Zod catches invalid data types",
    async () => {
      // We pass a NUMBER instead of a STRING for startDate
      const invalidPayload = { startDate: 12345 };
      const req = new Request("https://mock-edge-function.com", {
        method: "POST",
        body: JSON.stringify(invalidPayload),
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      // The Controller should immediately block it with a 400 Bad Request
      assertEquals(res.status, 400);
      assertEquals(body.success, false);
      assertStringIncludes(body.error, "expected string, received number"); // Zod's exact error!
    },
  );

  await t.step(
    "4. It should REJECT (400) if the JSON is malformed/broken",
    async () => {
      const req = new Request("https://mock-edge-function.com", {
        method: "POST",
        body: '{ "startDate": "missing-quote }', // Broken JSON
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 400);
      assertEquals(body.success, false);
      assertStringIncludes(body.error, "Invalid JSON payload");
    },
  );
});
