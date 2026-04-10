import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { OverwatchService } from "../services/overwatch.service.ts";
import { OverwatchController } from "../controllers/overwatch.controller.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";

Deno.test("OverwatchController - Validation & HTTP Suite", async (t) => {
  const mockService = {
    fetchRawRecords: (tableId: string, _params: unknown) => {
      // Simulate an Airtable API crash for a specific table ID
      if (tableId === "tbl_fail") {
        return Promise.reject(
          new Error("[Overwatch] Airtable API Error (404)"),
        );
      }
      // Simulate a successful raw response
      return Promise.resolve({
        records: [{ id: "rec123", fields: { Name: "Poko" } }],
      });
    },
  } as unknown as OverwatchService;

  const controller = new OverwatchController(mockService);

  await t.step(
    "1. Throws ValidationError if the payload is completely empty",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: "",
      });

      try {
        await controller.handleRequest(req);
        throw new Error("Expected a ValidationError to be thrown");
      } catch (err) {
        assertEquals(err instanceof ValidationError, true);
        assertStringIncludes(
          (err as ValidationError).message,
          "Empty payload",
        );
      }
    },
  );

  await t.step(
    "2. Throws ValidationError if tableId is missing from the JSON",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({ filterByFormula: "{Name}='Poko'" }),
      });

      try {
        await controller.handleRequest(req);
        throw new Error("Expected a ValidationError to be thrown");
      } catch (err) {
        assertEquals(err instanceof ValidationError, true);
        assertStringIncludes(
          (err as ValidationError).message,
          "tableId",
        );
      }
    },
  );

  await t.step(
    "3. Returns 200 with raw data for a valid payload",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({ tableId: "tbl_success", maxRecords: 1 }),
      });

      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.data.records[0].fields.Name, "Poko");
    },
  );

  await t.step(
    "4. Propagates downstream Airtable errors for withEdgeWrapper to handle",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({ tableId: "tbl_fail" }),
      });

      try {
        await controller.handleRequest(req);
        throw new Error("Expected a downstream error to be thrown");
      } catch (err) {
        assertEquals(err instanceof ValidationError, false);
        assertStringIncludes(
          (err as Error).message,
          "Airtable API Error",
        );
      }
    },
  );
});
