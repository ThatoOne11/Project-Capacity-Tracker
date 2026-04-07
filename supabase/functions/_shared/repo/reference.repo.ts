import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SupabaseTables } from "../constants/supabase.constants.ts";
import {
    ClockifyClient,
    ClockifyProject,
    ClockifyUser,
} from "../types/clockify.types.ts";

export class ReferenceRepository {
    constructor(private readonly client: SupabaseClient) {}

    // Returns names of added and renamed users
    async upsertUsers(
        users: ClockifyUser[],
    ): Promise<{ added: string[]; renamed: string[] }> {
        if (users.length === 0) return { added: [], renamed: [] };

        const added: string[] = [];
        const renamed: string[] = [];

        // 1. Fetch existing users to compare names
        const incomingIds = users.map((u) => u.id);
        const { data: existing } = await this.client
            .from(SupabaseTables.CLOCKIFY_USERS)
            .select("clockify_id, name")
            .in("clockify_id", incomingIds);

        // Map: ID -> Name
        const existingMap = new Map(
            existing?.map((e) => [e.clockify_id, e.name]) ?? [],
        );

        // 2. Classify (Add vs Rename)
        for (const u of users) {
            const currentName = u.name ?? u.email ?? "Unknown";

            if (existingMap.has(u.id)) {
                // ID exists -> Check for Rename
                const oldName = existingMap.get(u.id);
                if (oldName !== currentName) {
                    renamed.push(`${oldName} ➔ ${currentName}`);
                }
            } else {
                // ID doesn't exist -> New User
                added.push(currentName);
            }
        }

        // 3. Perform Upsert
        const { error } = await this.client.from(SupabaseTables.CLOCKIFY_USERS)
            .upsert(
                users.map((u) => ({
                    clockify_id: u.id,
                    name: u.name ?? u.email ?? "Unknown User",
                    email: u.email,
                })),
                { onConflict: "clockify_id" },
            );

        if (error) throw new Error(`DB Error (Users): ${error.message}`);

        return { added, renamed };
    }

    // Returns names of added projects
    async upsertProjects(projects: ClockifyProject[]): Promise<string[]> {
        if (projects.length === 0) return [];

        const newProjectNames: string[] = [];

        // 1. Identify New Projects
        const incomingIds = projects.map((p) => p.id);
        const { data: existing } = await this.client
            .from(SupabaseTables.CLOCKIFY_PROJECTS)
            .select("clockify_id")
            .in("clockify_id", incomingIds);

        const existingSet = new Set(existing?.map((e) => e.clockify_id));

        projects.forEach((p) => {
            if (!existingSet.has(p.id)) {
                newProjectNames.push(p.name);
            }
        });

        // 2. Resolve Client Dependencies
        const clientIds = [
            ...new Set(projects.map((p) => p.clientId).filter(Boolean)),
        ];
        const { data: dbClients } = await this.client
            .from(SupabaseTables.CLOCKIFY_CLIENTS)
            .select("id, clockify_id")
            .in("clockify_id", clientIds);

        const clientMap = new Map(
            dbClients?.map((c) => [c.clockify_id, c.id]) ?? [],
        );

        // 3. Upsert
        const { error } = await this.client.from(
            SupabaseTables.CLOCKIFY_PROJECTS,
        ).upsert(
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
        return newProjectNames;
    }

    // Returns names of added clients
    async upsertClients(clients: ClockifyClient[]): Promise<string[]> {
        if (clients.length === 0) return [];

        const newClientNames: string[] = [];
        const incomingIds = clients.map((c) => c.id);

        const { data: existing } = await this.client
            .from(SupabaseTables.CLOCKIFY_CLIENTS)
            .select("clockify_id")
            .in("clockify_id", incomingIds);

        const existingSet = new Set(existing?.map((e) => e.clockify_id));

        clients.forEach((c) => {
            if (!existingSet.has(c.id)) newClientNames.push(c.name);
        });

        const { error } = await this.client.from(
            SupabaseTables.CLOCKIFY_CLIENTS,
        ).upsert(
            clients.map((c) => ({ clockify_id: c.id, name: c.name })),
            { onConflict: "clockify_id" },
        );

        if (error) throw new Error(`DB Error (Clients): ${error.message}`);
        return newClientNames;
    }

    //Fetch logic for SyncService
    async fetchActiveUsers() {
        const { data, error } = await this.client
            .from(SupabaseTables.CLOCKIFY_USERS)
            .select("id, clockify_id, name");

        if (error) throw new Error(`DB Error: ${error.message}`);
        return data || [];
    }

    // Nullifies a dead Airtable ID across all reference tables
    async removeAirtableId(airtableId: string): Promise<void> {
        const tables = [
            SupabaseTables.CLOCKIFY_USERS,
            SupabaseTables.CLOCKIFY_PROJECTS,
            SupabaseTables.CLOCKIFY_CLIENTS,
        ];

        await Promise.all(
            tables.map(async (table) => {
                const { error } = await this.client
                    .from(table)
                    .update({ airtable_id: null })
                    .eq("airtable_id", airtableId);

                if (error) {
                    console.error(
                        `[ReferenceRepo] Failed to remove ghost ID in ${table}: ${error.message}`,
                    );
                    throw new Error(`DB Error (${table}): ${error.message}`);
                }
            }),
        );
    }
}
