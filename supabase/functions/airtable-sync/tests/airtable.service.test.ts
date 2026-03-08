import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { AirtableService } from "../services/airtable.service.ts";

Deno.test("AirtableService", async (t) => {
  const service = new AirtableService("fake_pat", "fake_base");

  await t.step("Chunks update records into batches of 10", async () => {
    let callCount = 0;

    // Override global fetch to intercept requests
    const originalFetch = globalThis.fetch;

    // Cast as typeof fetch to satisfy strict TS overloads
    globalThis.fetch =
      ((_input: string | URL | Request, options?: RequestInit) => {
        callCount++;
        const body = JSON.parse(options?.body as string);

        // Assert that no batch ever exceeds Airtable's 10-record limit
        assertEquals(body.records.length <= 10, true);

        return Promise.resolve(
          new Response(JSON.stringify({ records: body.records }), {
            status: 200,
          }),
        );
      }) as typeof fetch;

    // Generate 25 fake updates
    const updates = Array.from({ length: 25 }, (_, i) => ({
      id: `rec${i}`,
      fields: { "Actual Hours": i },
    }));

    await service.updateRecords("tblTest", updates);

    // 25 records should result in exactly 3 batches (10, 10, 5)
    assertEquals(callCount, 3);

    // Cleanup
    globalThis.fetch = originalFetch;
  });
});
