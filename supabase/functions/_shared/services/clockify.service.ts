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
  fetchRecentUserEntries(
    userId: string,
    start: string,
    end?: string,
  ): Promise<ClockifyTimeEntry[]> {
    const params = new URLSearchParams({
      start,
      hydrated: "true",
      "page-size": "200", // Large batch for recent changes
    });

    // Only add 'end' if it was actually passed in
    if (end) {
      params.append("end", end);
    }

    return this.get<ClockifyTimeEntry[]>(
      `/workspaces/${this.workspaceId}/user/${userId}/time-entries?${params.toString()}`,
    );
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
