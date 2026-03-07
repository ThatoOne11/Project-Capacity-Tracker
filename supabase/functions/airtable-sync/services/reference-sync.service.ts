import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AirtableService } from "./airtable.service.ts";
import { AIRTABLE_CONFIG } from "../../_shared/config.ts";
import {
  AggregateRow,
  AirtableRecord,
  ReferenceRecord,
  ViewRow,
} from "../types/types.ts";

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

  async getOrBuildProjectAssignments(
    sourceRows: AggregateRow[],
  ): Promise<Map<string, string>> {
    console.log(
      "[ReferenceSync] Verifying Project Assignments exist using pure IDs...",
    );
    const tableId = AIRTABLE_CONFIG.projectAssignmentsTableId;

    // Fetch using our new ID-only strategy
    const existingRecords = await this.airtable.fetchRecords(
      tableId,
      "PROJECT_ASSIGNMENT",
    );
    const idMap = this.buildAssignmentMap(existingRecords);
    const missingAssignments = this.identifyMissingAssignments(
      sourceRows,
      idMap,
    );

    if (missingAssignments.size > 0) {
      await this.createMissingAssignments(tableId, missingAssignments, idMap);
    }

    return idMap;
  }

  private buildAssignmentMap(records: AirtableRecord[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const rec of records) {
      const projects = rec.fields["Project"] as string[] | undefined;
      const month = rec.fields["Month"] as string | undefined; // e.g., "2026-02-01"

      if (projects && projects.length > 0 && month) {
        // Create an unbreakable key: recProjectID_2026-02-01
        map.set(`${projects[0]}_${month}`, rec.id);
      }
    }
    return map;
  }

  private identifyMissingAssignments(
    sourceRows: AggregateRow[],
    existingMap: Map<string, string>,
  ): Map<string, { projectId: string; isoDate: string }> {
    const missing = new Map<string, { projectId: string; isoDate: string }>();

    for (const row of sourceRows) {
      if (!row.airtable_project_id) continue;

      // Convert "February 2026" to "2026-02-01"
      const [mName, year] = row.month.split(" ");
      const mIndex = new Date(`${mName} 1, 2000`).getMonth() + 1;
      const isoDate = `${year}-${mIndex.toString().padStart(2, "0")}-01`;

      const key = `${row.airtable_project_id}_${isoDate}`;

      if (!existingMap.has(key) && !missing.has(key)) {
        missing.set(key, {
          projectId: row.airtable_project_id,
          isoDate: isoDate,
        });
      }
    }
    return missing;
  }

  private async createMissingAssignments(
    tableId: string,
    missing: Map<string, { projectId: string; isoDate: string }>,
    idMap: Map<string, string>,
  ): Promise<void> {
    console.log(
      `[ReferenceSync] Creating ${missing.size} missing Project Assignments...`,
    );

    for (const [key, data] of missing.entries()) {
      try {
        const newId = await this.airtable.createReferenceRecord(tableId, {
          Project: [data.projectId],
          Month: data.isoDate,
          // Zeroing out the manual numeric fields
          "Commitment Hours": 0,
          "Hours to be Paid": 0,
          "Original Invoice AMount": 0,
        });
        idMap.set(key, newId);
        console.log(`[ReferenceSync] Created Project Assignment: ${key}`);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(
          `[ReferenceSync] Failed to create Project Assignment ${key}:`,
          error.message,
        );
      }
    }
  }
}
