import { assertEquals } from "jsr:@std/assert";
import { AirtableService } from "./airtable.service.ts";

Deno.test("AirtableService - Rate Limit Batching Suite", async (t) => {
  // Initialize service with dummy credentials
  const service = new AirtableService("dummy_pat", "dummy_base");
  const dummyTable = "dummy_table";

  await t.step(
    "It should split 25 updates into exactly 3 fetch calls (10, 10, 5)",
    async () => {
      let fetchCallCount = 0;
      const originalFetch = globalThis.fetch;

      // Intercept (Mock) the fetch function
      globalThis.fetch = () => {
        fetchCallCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ records: [] }), { status: 200 }),
        );
      };

      try {
        // Generate 25 dummy updates
        const updates = Array.from({ length: 25 }).map((_, i) => ({
          id: `rec_${i}`,
          fields: { "Actual Hours": Math.random() * 10 },
        }));

        // Run the method with the new dynamic table ID parameter
        await service.updateRecords(dummyTable, updates);

        // Assert it made exactly 3 API calls
        assertEquals(fetchCallCount, 3);
      } finally {
        // 6. ALWAYS restore the original fetch function, even if the test fails
        globalThis.fetch = originalFetch;
      }
    },
  );

  await t.step(
    "It should make 0 fetch calls if the updates array is empty",
    async () => {
      let fetchCallCount = 0;
      const originalFetch = globalThis.fetch;

      globalThis.fetch = () => {
        fetchCallCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ records: [] }), { status: 200 }),
        );
      };

      try {
        // Run with empty array
        await service.updateRecords(dummyTable, []);
        assertEquals(fetchCallCount, 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});
