import { assertEquals } from "jsr:@std/assert";
import { AirtableService } from "./airtable.service.ts";

Deno.test("AirtableService - Rate Limit Batching Suite", async (t) => {
  // Initialize service with dummy credentials
  const service = new AirtableService("dummy_pat", "dummy_base", "dummy_table");

  await t.step(
    "It should split 25 updates into exactly 3 fetch calls (10, 10, 5)",
    async () => {
      let fetchCallCount = 0;

      // 1. Save the real fetch function
      const originalFetch = globalThis.fetch;

      // 2. Intercept (Mock) the fetch function
      globalThis.fetch = () => {
        fetchCallCount++;
        // Return a fake "200 OK" response so the code keeps running
        return Promise.resolve(
          new Response(JSON.stringify({ records: [] }), { status: 200 }),
        );
      };

      try {
        // 3. Generate 25 dummy updates
        const updates = Array.from({ length: 25 }).map((_, i) => ({
          id: `rec_${i}`,
          fields: { "Actual Hours": Math.random() * 10 },
        }));

        // 4. Run the method
        await service.updateRecords(updates);

        // 5. Assert it made exactly 3 API calls
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
        await service.updateRecords([]);
        assertEquals(fetchCallCount, 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});
