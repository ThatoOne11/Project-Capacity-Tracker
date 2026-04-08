import { z } from "npm:zod";
import { ApiConstants } from "../constants/api.constants.ts";
import {
  ClockifyClient,
  ClockifyClientSchema,
  ClockifyProject,
  ClockifyProjectSchema,
  ClockifyTimeEntry,
  ClockifyTimeEntrySchema,
  ClockifyUser,
  ClockifyUserSchema,
} from "../types/clockify.types.ts";
import { fetchWithBackoff } from "../utils/api.utils.ts";

export class ClockifyService {
  private readonly baseUrl: string = ApiConstants.CLOCKIFY_BASE_URL;
  private readonly headers: HeadersInit;

  constructor(apiKey: string, private readonly workspaceId: string) {
    this.headers = { "X-Api-Key": apiKey };
  }

  async fetchUsers(): Promise<ClockifyUser[]> {
    const data = await this.get(`/workspaces/${this.workspaceId}/users`);
    return z.array(ClockifyUserSchema).parse(data);
  }

  async fetchClients(): Promise<ClockifyClient[]> {
    const data = await this.get(`/workspaces/${this.workspaceId}/clients`);
    return z.array(ClockifyClientSchema).parse(data);
  }

  async fetchProjects(): Promise<ClockifyProject[]> {
    const data = await this.get(`/workspaces/${this.workspaceId}/projects`);
    return z.array(ClockifyProjectSchema).parse(data);
  }

  async fetchUserTimeEntries(
    userId: string,
    start: string,
    page: number,
    pageSize: number = ApiConstants.CLOCKIFY_PAGE_SIZE_BACKFILL,
  ): Promise<ClockifyTimeEntry[]> {
    const params = new URLSearchParams({
      start,
      page: page.toString(),
      "page-size": pageSize.toString(),
    });

    const data = await this.get(
      `/workspaces/${this.workspaceId}/user/${userId}/time-entries?${params}`,
    );
    return z.array(ClockifyTimeEntrySchema).parse(data);
  }

  // Fetches ALL entries within a time window (handles pagination automatically)
  // Hydrated=true ensures we get project names even if they are new.
  async fetchRecentUserEntries(
    userId: string,
    start: string,
    end?: string,
  ): Promise<ClockifyTimeEntry[]> {
    const pageSize = ApiConstants.CLOCKIFY_PAGE_SIZE_SYNC;
    let page = 1;
    const allEntries: ClockifyTimeEntry[] = [];

    while (true) {
      const params = new URLSearchParams({
        start,
        hydrated: "true",
        "page-size": pageSize.toString(),
        page: page.toString(),
      });

      if (end) params.append("end", end);

      const response = await this.get(
        `/workspaces/${this.workspaceId}/user/${userId}/time-entries?${params}`,
      );

      const chunk = z.array(ClockifyTimeEntrySchema).parse(response);
      allEntries.push(...chunk);

      if (chunk.length < pageSize) break;

      page++;
    }

    return allEntries;
  }

  private async get(endpoint: string): Promise<unknown> {
    const res = await fetchWithBackoff(`${this.baseUrl}${endpoint}`, {
      headers: this.headers,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Clockify API Error [${res.status}]: ${errorText}`);
    }

    return res.json();
  }
}
