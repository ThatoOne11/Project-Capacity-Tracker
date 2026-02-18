import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    ClockifyClient,
    ClockifyProject,
    ClockifyUser,
} from "../types/types.ts";

export class ReferenceRepository {
    constructor(private readonly client: SupabaseClient) {}

    async upsertUsers(users: ClockifyUser[]): Promise<void> {
        if (users.length === 0) return;

        const { error } = await this.client.from("clockify_users").upsert(
            users.map((u) => ({
                clockify_id: u.id,
                name: u.name ?? u.email ?? "Unknown User",
                email: u.email,
            })),
            { onConflict: "clockify_id" },
        );

        if (error) throw new Error(`DB Error (Users): ${error.message}`);
    }

    async upsertClients(clients: ClockifyClient[]): Promise<void> {
        if (clients.length === 0) return;

        const { error } = await this.client.from("clockify_clients").upsert(
            clients.map((c) => ({
                clockify_id: c.id,
                name: c.name,
            })),
            { onConflict: "clockify_id" },
        );

        if (error) throw new Error(`DB Error (Clients): ${error.message}`);
    }

    async upsertProjects(projects: ClockifyProject[]): Promise<void> {
        if (projects.length === 0) return;

        // 1. Resolve Client IDs first
        const clientIds = [
            ...new Set(projects.map((p) => p.clientId).filter(Boolean)),
        ];
        const { data: dbClients } = await this.client
            .from("clockify_clients")
            .select("id, clockify_id")
            .in("clockify_id", clientIds);

        const clientMap = new Map(
            dbClients?.map((c) => [c.clockify_id, c.id]) ?? [],
        );

        // 2. Upsert Projects
        const { error } = await this.client.from("clockify_projects").upsert(
            projects.map((p) => ({
                clockify_id: p.id,
                name: p.name,
                client_id: p.clientId
                    ? (clientMap.get(p.clientId) ?? null)
                    : null,
            })),
            { onConflict: "clockify_id" },
        );

        if (error) throw new Error(`DB Error (Projects): ${error.message}`);
    }

    async fetchActiveUsers() {
        const { data, error } = await this.client
            .from("clockify_users")
            .select("id, clockify_id, name");

        if (error) throw new Error(error.message);
        return data || [];
    }
}
