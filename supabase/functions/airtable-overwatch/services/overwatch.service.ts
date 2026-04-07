import { ApiConstants } from "../../_shared/constants/api.constants.ts";
import { fetchWithBackoff } from "../../_shared/utils/api.utils.ts";

export class OverwatchService {
  private readonly baseUrl = ApiConstants.AIRTABLE_BASE_URL;
  private readonly headers: HeadersInit;

  constructor(private readonly pat: string, private readonly baseId: string) {
    this.headers = {
      Authorization: `Bearer ${this.pat}`,
      "Content-Type": "application/json",
    };
  }

  async fetchRawRecords(
    tableId: string,
    params: {
      filterByFormula?: string;
      maxRecords?: number;
      fields?: string[];
    },
  ): Promise<unknown> {
    const urlParams = new URLSearchParams();

    if (params.filterByFormula) {
      urlParams.append("filterByFormula", params.filterByFormula);
    }
    if (params.maxRecords) {
      urlParams.append("maxRecords", params.maxRecords.toString());
    }
    if (params.fields) {
      params.fields.forEach((field) => urlParams.append("fields[]", field));
    }

    const url =
      `${this.baseUrl}/${this.baseId}/${tableId}?${urlParams.toString()}`;

    // We use your shared auto-retry fetcher to respect Airtable's strict limits
    const res = await fetchWithBackoff(url, { headers: this.headers });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `[Overwatch] Airtable API Error (${res.status}): ${errorText}`,
      );
    }

    return await res.json();
  }
}
