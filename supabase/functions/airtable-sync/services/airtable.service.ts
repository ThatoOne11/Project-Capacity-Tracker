import {
  AirtableInsert,
  AirtableRecord,
  AirtableResponseSchema,
} from "../types/types.ts";

export class AirtableService {
  private readonly baseUrl = "https://api.airtable.com/v0";
  private readonly headers: HeadersInit;

  constructor(private readonly pat: string, private readonly baseId: string) {
    this.headers = {
      Authorization: `Bearer ${this.pat}`,
      "Content-Type": "application/json",
    };
  }

  async fetchRecords(tableId: string): Promise<AirtableRecord[]> {
    const allRecords: AirtableRecord[] = [];
    let offset: string | undefined = undefined;

    do {
      const params = new URLSearchParams();
      params.append("fields[]", "User");
      params.append("fields[]", "Project");
      params.append("fields[]", "Month");
      params.append("fields[]", "Actual Hours");
      if (offset) params.append("offset", offset);

      const url =
        `${this.baseUrl}/${this.baseId}/${tableId}?${params.toString()}`;
      const res = await fetch(url, { headers: this.headers });

      if (!res.ok) {
        throw new Error(`Airtable Fetch Failed: ${await res.text()}`);
      }

      const rawData = await res.json();
      const data = AirtableResponseSchema.parse(rawData);

      if (data.records) allRecords.push(...data.records);
      offset = data.offset;

      if (offset) await new Promise((r) => setTimeout(r, 200)); // Small pause to be nice to the API
    } while (offset);

    console.log(`Total records found: ${allRecords.length}`);
    return allRecords;
  }

  async updateRecords(
    tableId: string,
    updates: { id: string; fields: Record<string, unknown> }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    const url = `${this.baseUrl}/${this.baseId}/${tableId}`;
    console.log(`Pushing ${updates.length} updates to Airtable...`);

    // Airtable limit: 10 records per request
    for (let i = 0; i < updates.length; i += 10) {
      const chunk = updates.slice(i, i + 10);
      const res = await fetch(url, {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify({ records: chunk }),
      });
      if (!res.ok) throw new Error(`Batch failed: ${await res.text()}`);
      await new Promise((resolve) => setTimeout(resolve, 350)); // Sleep 350ms between batches to avoid 429 Rate Limits
    }
  }

  async createRecords(
    tableId: string,
    inserts: AirtableInsert[],
  ): Promise<void> {
    if (inserts.length === 0) return;
    const url = `${this.baseUrl}/${this.baseId}/${tableId}`;
    console.log(`Pushing ${inserts.length} new records to Airtable...`);

    for (let i = 0; i < inserts.length; i += 10) {
      const chunk = inserts.slice(i, i + 10);
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ records: chunk }),
      });
      if (!res.ok) throw new Error(`Batch insert failed: ${await res.text()}`);
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  // Helper for ReferenceSyncService to auto-create Users/Clients/Projects
  async createReferenceRecord(
    tableId: string,
    fields: Record<string, unknown>,
  ): Promise<string> {
    const url = `${this.baseUrl}/${this.baseId}/${tableId}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ records: [{ fields }] }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create reference: ${await res.text()}`);
    }
    const data = await res.json();
    return data.records[0].id;
  }
}
