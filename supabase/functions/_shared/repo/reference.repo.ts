import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    ReferenceTableName,
    SupabaseTables,
} from "../constants/supabase.constants.ts";
import {
    ClockifyClient,
    ClockifyProject,
    ClockifyUser,
} from "../types/clockify.types.ts";
import { DbUser, ProjectRow, ReferenceRecord } from "../types/sync.types.ts";

export class ReferenceRepository {
    constructor(private readonly client: SupabaseClient) {}

    async upsertUsers(
        users: ClockifyUser[],
    ): Promise<{ added: string[]; renamed: string[] }> {
        if (users.length === 0) return { added: [], renamed: [] };

        const added: string[] = [];
        const renamed: string[] = [];

        const incomingIds = users.map((u) => u.id);
        const { data: existing } = await this.client
            .from(SupabaseTables.CLOCKIFY_USERS)
            .select("clockify_id, name")
            .in("clockify_id", incomingIds);

        const existingMap = new Map<string, string>(
            (existing as Array<{ clockify_id: string; name: string }> ?? [])
                .map((e) => [e.clockify_id, e.name]),
        );

        for (const u of users) {
            const currentName = u.name ?? u.email ?? "Unknown";

            if (existingMap.has(u.id)) {
                const oldName = existingMap.get(u.id);
                if (oldName !== currentName) {
                    renamed.push(`${oldName} ➔ ${currentName}`);
                }
            } else {
                added.push(currentName);
            }
        }

        const { error } = await this.client
            .from(SupabaseTables.CLOCKIFY_USERS)
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

    async upsertProjects(projects: ClockifyProject[]): Promise<string[]> {
        if (projects.length === 0) return [];

        const newProjectNames: string[] = [];
        const incomingIds = projects.map((p) => p.id);

        const { data: existing } = await this.client
            .from(SupabaseTables.CLOCKIFY_PROJECTS)
            .select("clockify_id")
            .in("clockify_id", incomingIds);

        const existingSet = new Set<string>(
            (existing as Array<{ clockify_id: string }> ?? []).map((e) =>
                e.clockify_id
            ),
        );

        for (const p of projects) {
            if (!existingSet.has(p.id)) newProjectNames.push(p.name);
        }

        const clientIds = [
            ...new Set(projects.map((p) => p.clientId).filter(Boolean)),
        ] as string[];

        const { data: dbClients } = await this.client
            .from(SupabaseTables.CLOCKIFY_CLIENTS)
            .select("id, clockify_id")
            .in("clockify_id", clientIds);

        const clientMap = new Map<string, string>(
            (dbClients as Array<{ clockify_id: string; id: string }> ?? [])
                .map((c) => [c.clockify_id, c.id]),
        );

        const { error } = await this.client
            .from(SupabaseTables.CLOCKIFY_PROJECTS)
            .upsert(
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

    async upsertClients(clients: ClockifyClient[]): Promise<string[]> {
        if (clients.length === 0) return [];

        const newClientNames: string[] = [];
        const incomingIds = clients.map((c) => c.id);

        const { data: existing } = await this.client
            .from(SupabaseTables.CLOCKIFY_CLIENTS)
            .select("clockify_id")
            .in("clockify_id", incomingIds);

        const existingSet = new Set<string>(
            (existing as Array<{ clockify_id: string }> ?? []).map((e) =>
                e.clockify_id
            ),
        );

        for (const c of clients) {
            if (!existingSet.has(c.id)) newClientNames.push(c.name);
        }

        const { error } = await this.client
            .from(SupabaseTables.CLOCKIFY_CLIENTS)
            .upsert(
                clients.map((c) => ({ clockify_id: c.id, name: c.name })),
                { onConflict: "clockify_id" },
            );

        if (error) throw new Error(`DB Error (Clients): ${error.message}`);
        return newClientNames;
    }

    async fetchActiveUsers(): Promise<DbUser[]> {
        const { data, error } = await this.client
            .from(SupabaseTables.CLOCKIFY_USERS)
            .select("id, clockify_id, name");

        if (error) {
            throw new Error(`DB Error (fetchActiveUsers): ${error.message}`);
        }
        return (data ?? []) as DbUser[];
    }

    async fetchProjectsByNames(names: string[]): Promise<ProjectRow[]> {
        const { data, error } = await this.client
            .from(SupabaseTables.CLOCKIFY_PROJECTS)
            .select("id, name, client_id, airtable_id")
            .in("name", names);

        if (error) {
            throw new Error(
                `DB Error (fetchProjectsByNames): ${error.message}`,
            );
        }
        return (data ?? []) as ProjectRow[];
    }

    async fetchMissingClientsByIds(
        clientIds: string[],
    ): Promise<ReferenceRecord[]> {
        const { data, error } = await this.client
            .from(SupabaseTables.CLOCKIFY_CLIENTS)
            .select("id, name")
            .is("airtable_id", null)
            .in("id", clientIds);

        if (error) {
            throw new Error(
                `DB Error (fetchMissingClientsByIds): ${error.message}`,
            );
        }
        return (data ?? []) as ReferenceRecord[];
    }

    // Fetches records from a reference table that have not yet been linked to Airtable.
    async fetchMissingReferencesByNames(
        table: ReferenceTableName,
        names: string[],
    ): Promise<ReferenceRecord[]> {
        const { data, error } = await this.client
            .from(table)
            .select("id, name")
            .is("airtable_id", null)
            .in("name", names);

        if (error) {
            throw new Error(
                `DB Error (fetchMissingReferencesByNames:${table}): ${error.message}`,
            );
        }
        return (data ?? []) as ReferenceRecord[];
    }

    async saveAirtableId(
        table: ReferenceTableName,
        recordId: string,
        airtableId: string,
    ): Promise<void> {
        const { error } = await this.client
            .from(table)
            .update({ airtable_id: airtableId })
            .eq("id", recordId);

        if (error) {
            throw new Error(
                `DB Error (saveAirtableId:${table}): ${error.message}`,
            );
        }
    }

    // Nullifies a dead Airtable ID across all reference tables
    async removeAirtableId(airtableId: string): Promise<void> {
        const tables = [
            SupabaseTables.CLOCKIFY_USERS,
            SupabaseTables.CLOCKIFY_PROJECTS,
            SupabaseTables.CLOCKIFY_CLIENTS,
        ] as const;

        await Promise.all(
            tables.map(async (table) => {
                const { error } = await this.client
                    .from(table)
                    .update({ airtable_id: null })
                    .eq("airtable_id", airtableId);

                if (error) {
                    throw new Error(`DB Error (${table}): ${error.message}`);
                }
            }),
        );
    }
}
