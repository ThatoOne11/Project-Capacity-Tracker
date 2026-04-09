import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { BackfillService } from "../services/backfill.service.ts";
import { BackfillController } from "../controller/backfill.controller.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";

Deno.test("BackfillController - Validation & HTTP Suite", async (t) => {
  const mockService = {
    syncReferenceData: () => Promise.resolve(),
    syncTimeEntries: (_startDate: string, _userId?: string) =>
      Promise.resolve(42),
  } as unknown as BackfillService;

  const controller = new BackfillController(mockService);

  await t.step(
    "1. Returns 200 and defaults to the configured start date when body is empty",
    async () => {
      const req = new Request("https://mock.com", { method: "POST" });
      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.synced, 42);
    },
  );

  await t.step(
    "2. Returns 200 for a perfectly formatted payload",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({
          startDate: "2026-02-01T00:00:00Z",
          userId: "user_123",
        }),
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.success, true);
    },
  );

  await t.step(
    "3. Throws ValidationError if startDate is a number instead of a string",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({ startDate: 12345 }),
      });

      try {
        await controller.handleRequest(req);
        throw new Error("Expected a ValidationError to be thrown");
      } catch (err) {
        assertEquals(err instanceof ValidationError, true);
        assertStringIncludes(
          (err as ValidationError).message,
          "expected string, received number",
        );
      }
    },
  );

  await t.step(
    "4. Throws ValidationError if the JSON is malformed",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: '{ "startDate": "missing-quote }',
      });

      try {
        await controller.handleRequest(req);
        throw new Error("Expected a ValidationError to be thrown");
      } catch (err) {
        assertEquals(err instanceof ValidationError, true);
        assertStringIncludes(
          (err as ValidationError).message,
          "Invalid JSON payload",
        );
      }
    },
  );
});
