import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AirtableService } from "./airtable.service.ts";
import { AIRTABLE_CONFIG } from "../../_shared/config.ts";
import { ReferenceRecord, ViewRow } from "../types/types.ts";

export class ReferenceSyncService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly airtable: AirtableService,
  ) {}

  async syncAllReferences(): Promise<void> {
    console.log(
      "[ReferenceSync] Checking for missing IDs among ACTIVE records...",
    );

    const { activeUsers, activeProjects } = await this
      .getActiveNamesFromViews();

    if (activeUsers.length > 0) {
      await this.syncTable(
        "clockify_users",
        AIRTABLE_CONFIG.employeesTableId,
        "Full Name",
        activeUsers,
      );
    }

    if (activeProjects.length > 0) {
      await this.syncProjectsAndClients(activeProjects);
    }
  }

  private async getActiveNamesFromViews(): Promise<
    { activeUsers: string[]; activeProjects: string[] }
  > {
    const users = new Set<string>();
    const projects = new Set<string>();

    const [monthly, payroll] = await Promise.all([
      this.supabase.from("monthly_aggregates_view").select(
        "user_name, project_name",
      ),
      this.supabase.from("payroll_aggregates_view").select(
        "user_name, project_name",
      ),
    ]);

    const processRows = (rows: ViewRow[] | null) => {
      if (!rows) return;
      for (const row of rows) {
        if (row.user_name) users.add(row.user_name);
        if (row.project_name && row.project_name !== "No Project") {
          projects.add(row.project_name);
        }
      }
    };

    processRows(monthly.data as ViewRow[] | null);
    processRows(payroll.data as ViewRow[] | null);

    return {
      activeUsers: Array.from(users),
      activeProjects: Array.from(projects),
    };
  }

  private async syncProjectsAndClients(
    activeProjectNames: string[],
  ): Promise<void> {
    const { data: projects, error } = await this.supabase
      .from("clockify_projects")
      .select("id, name, client_id, airtable_id")
      .in("name", activeProjectNames);

    if (error || !projects) return;

    const missingProjects = projects.filter((p) => !p.airtable_id);

    // Explicitly type the mapped array
    const activeClientIds = Array.from(
      new Set(
        projects.map((p) => p.client_id).filter((id): id is string =>
          Boolean(id)
        ),
      ),
    );

    await this.createMissingRecords(
      "clockify_projects",
      AIRTABLE_CONFIG.projectsTableId,
      "Name",
      missingProjects,
    );

    if (activeClientIds.length > 0) {
      const { data: missingClients } = await this.supabase
        .from("clockify_clients")
        .select("id, name")
        .is("airtable_id", null)
        .in("id", activeClientIds);

      if (missingClients && missingClients.length > 0) {
        await this.createMissingRecords(
          "clockify_clients",
          AIRTABLE_CONFIG.clientsTableId,
          "Name",
          missingClients,
        );
      }
    }
  }

  private async syncTable(
    supabaseTable: string,
    airtableTableId: string,
    airtableNameField: string,
    activeNames: string[],
  ): Promise<void> {
    // 1. Find all records missing an Airtable ID
    const { data: missingRecords, error } = await this.supabase
      .from(supabaseTable)
      .select("id, name")
      .is("airtable_id", null)
      .in("name", activeNames);

    if (error || !missingRecords || missingRecords.length === 0) return;

    await this.createMissingRecords(
      supabaseTable,
      airtableTableId,
      airtableNameField,
      missingRecords,
    );
  }

  private async createMissingRecords(
    supabaseTable: string,
    airtableTableId: string,
    airtableNameField: string,
    records: ReferenceRecord[],
  ): Promise<void> {
    if (records.length === 0) return;

    console.log(
      `[ReferenceSync] Found ${records.length} active missing records in ${supabaseTable}. Creating...`,
    );

    for (const record of records) {
      try {
        const fields: Record<string, unknown> = {
          [airtableNameField]: record.name,
        };

        const newAirtableId = await this.airtable.createReferenceRecord(
          airtableTableId,
          fields,
        );

        const { error: updateErr } = await this.supabase
          .from(supabaseTable)
          .update({ airtable_id: newAirtableId })
          .eq("id", record.id);

        if (updateErr) throw new Error(updateErr.message);

        console.log(
          `[ReferenceSync] Created & Linked: ${record.name} (${newAirtableId})`,
        );
      } catch (err: unknown) {
        const error = err as Error;
        console.error(
          `[ReferenceSync] Failed to create/link ${record.name}:`,
          error.message,
        );
      }
    }
  }
}
