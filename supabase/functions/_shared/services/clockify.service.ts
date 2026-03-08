import {
  ClockifyClient,
  ClockifyClientSchema,
  ClockifyProject,
  ClockifyProjectSchema,
  ClockifyTimeEntry,
  ClockifyTimeEntrySchema,
  ClockifyUser,
  ClockifyUserSchema,
} from "../../_shared/types/types.ts";
import { z } from "npm:zod";
import { ApiConstants } from "../constants/api.constants.ts";

export class ClockifyService {
  private readonly baseUrl = ApiConstants.CLOCKIFY_BASE_URL;
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
    pageSize = 50,
  ): Promise<ClockifyTimeEntry[]> {
    const query = `start=${start}&page=${page}&page-size=${pageSize}`;
    const data = await this.get(
      `/workspaces/${this.workspaceId}/user/${userId}/time-entries?${query}`,
    );
    return z.array(ClockifyTimeEntrySchema).parse(data);
  }

  // Fetches entries within a time window for a specific user.
  // Hydrated=true ensures we get project names even if they are new.
  // Fetches ALL entries within a time window (handles pagination automatically)
  async fetchRecentUserEntries(
    userId: string,
    start: string,
    end?: string,
  ): Promise<ClockifyTimeEntry[]> {
    let page = 1;
    const pageSize = 200;
    const allEntries: ClockifyTimeEntry[] = [];
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        start,
        hydrated: "true",
        "page-size": pageSize.toString(),
        page: page.toString(),
      });

      if (end) params.append("end", end);

      const response = await this.get(
        `/workspaces/${this.workspaceId}/user/${userId}/time-entries?${params.toString()}`,
      );

      const parsedChunk = z.array(ClockifyTimeEntrySchema).parse(response);
      allEntries.push(...parsedChunk);

      if (parsedChunk.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return allEntries;
  }

  private async get(endpoint: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Clockify API Error [${res.status}]: ${errorText}`);
    }
    return res.json();
  }
}
