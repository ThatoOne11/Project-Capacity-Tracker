import {
  ClockifyClient,
  ClockifyProject,
  ClockifyTimeEntry,
  ClockifyUser,
} from "../../_shared/types/types.ts";

export class ClockifyService {
  private readonly baseUrl = "https://docs.clockify.me/api/v1";
  private readonly headers: HeadersInit;

  constructor(apiKey: string, private workspaceId: string) {
    this.headers = { "X-Api-Key": apiKey };
  }

  fetchUsers(): Promise<ClockifyUser[]> {
    return this.get<ClockifyUser[]>(`/workspaces/${this.workspaceId}/users`);
  }

  fetchClients(): Promise<ClockifyClient[]> {
    return this.get<ClockifyClient[]>(
      `/workspaces/${this.workspaceId}/clients`,
    );
  }

  fetchProjects(): Promise<ClockifyProject[]> {
    return this.get<ClockifyProject[]>(
      `/workspaces/${this.workspaceId}/projects`,
    );
  }

  fetchUserTimeEntries(
    userId: string,
    start: string,
    page: number,
    pageSize = 50,
  ): Promise<ClockifyTimeEntry[]> {
    const query = `start=${start}&page=${page}&page-size=${pageSize}`;
    return this.get<ClockifyTimeEntry[]>(
      `/workspaces/${this.workspaceId}/user/${userId}/time-entries?${query}`,
    );
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

      const response = await this.get<ClockifyTimeEntry[]>(
        `/workspaces/${this.workspaceId}/user/${userId}/time-entries?${params.toString()}`,
      );

      allEntries.push(...response);

      // If we got a full page, there might be more. If less, we are done.
      if (response.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return allEntries;
  }

  private async get<T>(endpoint: string): Promise<T> {
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
