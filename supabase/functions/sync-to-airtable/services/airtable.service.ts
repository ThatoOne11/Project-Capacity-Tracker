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
      let url =
        `${this.baseUrl}/${this.baseId}/${this.tableId}?fields%5B%5D=Name&fields%5B%5D=Actual+Hours`;

      if (offset) {
        url += `&offset=${offset}`;
      }

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
        console.log(
          `   ..found ${allRecords.length} records, fetching next page...`,
        );
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

    for (let i = 0; i < updates.length; i += 10) {
      const chunk = updates.slice(i, i + 10);
      const res = await fetch(url, {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify({ records: chunk }),
      });

      if (!res.ok) {
        console.error(`Batch Update Failed: ${await res.text()}`);
      }
    }
  }
}
