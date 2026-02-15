import {
  ClockifyClient,
  ClockifyProject,
  ClockifyTimeEntry,
  ClockifyUser,
} from "../types/types.ts";

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
