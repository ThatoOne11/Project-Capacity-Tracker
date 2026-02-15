import { AirtableRecord } from "../types/types.ts";

export class AirtableService {
  private readonly baseUrl = "https://api.airtable.com/v0";
  private readonly headers: HeadersInit;

  constructor(
    private readonly pat: string,
    private readonly baseId: string,
    private readonly tableId: string,
  ) {
    this.headers = {
      Authorization: `Bearer ${this.pat}`,
      "Content-Type": "application/json",
    };
  }

  async fetchRecords(): Promise<AirtableRecord[]> {
    const allRecords: AirtableRecord[] = [];
    let offset: string | undefined = undefined;

    do {
      const params = new URLSearchParams();
      params.append("fields[]", "Name");
      params.append("fields[]", "Actual Hours");
      if (offset) params.append("offset", offset);

      const url =
        `${this.baseUrl}/${this.baseId}/${this.tableId}?${params.toString()}`;

      const res = await fetch(url, { headers: this.headers });

      if (!res.ok) {
        throw new Error(`Airtable Fetch Failed: ${await res.text()}`);
      }

      const data = await res.json();
      if (data.records) {
        allRecords.push(...(data.records as AirtableRecord[]));
      }

      offset = data.offset;

      if (offset) {
        // 2. Small pause to be nice to the API
        await new Promise((r) => setTimeout(r, 200));
        console.log(`   ..fetched ${allRecords.length} records so far...`);
      }
    } while (offset);

    console.log(`Total records found: ${allRecords.length}`);
    return allRecords;
  }

  async updateRecords(
    updates: { id: string; fields: { "Actual Hours": number } }[],
  ): Promise<void> {
    if (updates.length === 0) return;

    const url = `${this.baseUrl}/${this.baseId}/${this.tableId}`;
    console.log(`Pushing ${updates.length} updates to Airtable...`);

    // Airtable limit: 10 records per request
    for (let i = 0; i < updates.length; i += 10) {
      const chunk = updates.slice(i, i + 10);

      try {
        const res = await fetch(url, {
          method: "PATCH",
          headers: this.headers,
          body: JSON.stringify({ records: chunk }),
        });

        if (!res.ok) {
          throw new Error(`Batch failed: ${await res.text()}`);
        }

        // 3. Sleep 350ms between batches to avoid 429 Rate Limits (Ensures we never exceed ~3 requests/second)
        await new Promise((resolve) => setTimeout(resolve, 350));
      } catch (err) {
        console.error(`Batch ${i / 10 + 1} Error:`, err);
        throw err; // whole sync fails on one batch error
      }
    }
    console.log("Airtable updates complete.");
  }
}
