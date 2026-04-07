import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { OverwatchService } from "../services/overwatch.service.ts";
import { OverwatchController } from "../controllers/overwatch.controller.ts";

Deno.test("OverwatchController - Zod Validation & HTTP Suite", async (t) => {
  // 1. Create a Mock Service
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
    "1. It should REJECT (400) if the payload is completely empty",
    async () => {
      const req = new Request("https://mock.com", { method: "POST", body: "" });
      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 400);
      assertEquals(body.success, false);
      assertStringIncludes(body.error, "Empty payload");
    },
  );

  await t.step(
    "2. It should REJECT (400) if tableId is missing from the JSON",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({ filterByFormula: "{Name}='Poko'" }),
      });
      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 400);
      assertEquals(body.success, false);
      assertStringIncludes(body.error, "tableId"); // Zod caught the missing field
    },
  );

  await t.step(
    "3. It should RETURN 200 and raw data for a valid payload",
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
    "4. It should RETURN 500 if the downstream Airtable API fails",
    async () => {
      const req = new Request("https://mock.com", {
        method: "POST",
        body: JSON.stringify({ tableId: "tbl_fail" }),
      });
      const res = await controller.handleRequest(req);
      const body = await res.json();

      assertEquals(res.status, 500);
      assertEquals(body.success, false);
      assertStringIncludes(body.error, "Airtable API Error");
    },
  );
});
