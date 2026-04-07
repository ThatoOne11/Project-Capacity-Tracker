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
  ): Promise<{ records: unknown[] }> {
    const allRecords: unknown[] = [];
    let offset: string | undefined = undefined;

    do {
      const urlParams = new URLSearchParams();

      if (params.filterByFormula) {
        urlParams.append("filterByFormula", params.filterByFormula);
      }
      if (params.fields) {
        params.fields.forEach((field) => urlParams.append("fields[]", field));
      }

      if (offset) urlParams.append("offset", offset);

      const url = `${this.baseUrl}/${encodeURIComponent(this.baseId)}/${
        encodeURIComponent(tableId)
      }?${urlParams.toString()}`;

      const res = await fetchWithBackoff(url, { headers: this.headers });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `[Overwatch] Airtable API Error (${res.status}): ${errorText}`,
        );
      }

      const data = await res.json();

      if (data.records) {
        allRecords.push(...data.records);
      }

      offset = data.offset;

      if (params.maxRecords && allRecords.length >= params.maxRecords) {
        allRecords.length = params.maxRecords;
        break;
      }
    } while (offset);

    return { records: allRecords };
  }
}
