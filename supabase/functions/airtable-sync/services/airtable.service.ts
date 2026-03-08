import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";
import { SyncStrategies, SyncStrategy } from "../constants/sync.consts.ts";
import { ApiConstants } from "../../_shared/constants/api.constants.ts";
import {
  AirtableInsert,
  AirtableRecord,
  AirtableResponseSchema,
} from "../types/airtable.types.ts";

export class AirtableService {
  private readonly baseUrl = ApiConstants.AIRTABLE_BASE_URL;
  private readonly headers: HeadersInit;

  constructor(private readonly pat: string, private readonly baseId: string) {
    this.headers = {
      Authorization: `Bearer ${this.pat}`,
      "Content-Type": "application/json",
    };
  }

  // Fetches paginated records from an Airtable table based on the required sync strategy.
  async fetchRecords(
    tableId: string,
    strategy: SyncStrategy,
  ): Promise<AirtableRecord[]> {
    const allRecords: AirtableRecord[] = [];
    let offset: string | undefined = undefined;

    do {
      const params = new URLSearchParams();

      if (strategy === SyncStrategies.PAYROLL) {
        params.append("fields[]", AIRTABLE_FIELDS.USER);
        params.append("fields[]", AIRTABLE_FIELDS.PROJECT);
        params.append("fields[]", AIRTABLE_FIELDS.MONTH);
        params.append("fields[]", AIRTABLE_FIELDS.ACTUAL_HOURS);
      } else if (strategy === SyncStrategies.ASSIGNMENT) {
        params.append("fields[]", AIRTABLE_FIELDS.PERSON);
        params.append("fields[]", AIRTABLE_FIELDS.PROJECT_ASSIGNMENT);
        params.append("fields[]", AIRTABLE_FIELDS.ACTUAL_HOURS);
        params.append("fields[]", AIRTABLE_FIELDS.ASSIGNED_HOURS);
      } else if (strategy === SyncStrategies.PROJECT_ASSIGNMENT) {
        params.append("fields[]", AIRTABLE_FIELDS.PROJECT);
        params.append("fields[]", AIRTABLE_FIELDS.MONTH);
      }

      if (offset) params.append("offset", offset);

      const url =
        `${this.baseUrl}/${this.baseId}/${tableId}?${params.toString()}`;
      const res = await fetch(url, { headers: this.headers });

      if (!res.ok) {
        throw new Error(`[AirtableService] Fetch Failed: ${await res.text()}`);
      }

      const rawData = await res.json();
      const data = AirtableResponseSchema.parse(rawData);

      if (data.records) allRecords.push(...data.records);
      offset = data.offset;

      if (offset) await new Promise((resolve) => setTimeout(resolve, 200));
    } while (offset);

    console.log(
      `[AirtableService] Retrieved ${allRecords.length} records for strategy: ${strategy}`,
    );
    return allRecords;
  }

  //Updates records in batches of 10 to comply with Airtable's API limits.
  async updateRecords(
    tableId: string,
    updates: { id: string; fields: Record<string, unknown> }[],
  ): Promise<void> {
    if (updates.length === 0) return;

    const url = `${this.baseUrl}/${this.baseId}/${tableId}`;
    console.log(
      `[AirtableService] Pushing ${updates.length} updates in batches...`,
    );

    for (let i = 0; i < updates.length; i += 10) {
      const chunk = updates.slice(i, i + 10);
      const res = await fetch(url, {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify({ records: chunk }),
      });

      if (!res.ok) {
        throw new Error(
          `[AirtableService] Batch update failed: ${await res.text()}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Creates new records in batches of 10. Uses typecast to auto-link reference fields.
  async createRecords(
    tableId: string,
    inserts: AirtableInsert[],
  ): Promise<void> {
    if (inserts.length === 0) return;

    const url = `${this.baseUrl}/${this.baseId}/${tableId}`;
    console.log(
      `[AirtableService] Pushing ${inserts.length} new records in batches...`,
    );

    for (let i = 0; i < inserts.length; i += 10) {
      const chunk = inserts.slice(i, i + 10);
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ records: chunk, typecast: true }),
      });

      if (!res.ok) {
        throw new Error(
          `[AirtableService] Batch insert failed: ${await res.text()}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Creates a single reference record (e.g. User, Client, Project) and returns its new Airtable ID.
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
      throw new Error(
        `[AirtableService] Failed to create reference: ${await res.text()}`,
      );
    }

    const data = await res.json();
    return data.records[0].id;
  }
}
