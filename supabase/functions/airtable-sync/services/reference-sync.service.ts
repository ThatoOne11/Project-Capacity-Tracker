import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AirtableService } from "./airtable.service.ts";
import { AIRTABLE_CONFIG } from "../../_shared/config.ts";
import { AggregateRow, ReferenceRecord, ViewRow } from "../types/sync.types.ts";
import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";
import { SyncStrategies } from "../constants/sync.consts.ts";
import {
  SupabaseTables,
  SupabaseViews,
} from "../../_shared/constants/supabase.constants.ts";
import { AirtableRecord } from "../types/airtable.types.ts";
import { formatMonthToIsoDate } from "../../_shared/utils/date.utils.ts";
import { DownstreamSyncError } from "../../_shared/exceptions/custom.exceptions.ts";

// Ensures all relational dependencies (Users, Clients, Projects) exist in Airtable
// before attempting to sync numerical time entries.
export class ReferenceSyncService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly airtable: AirtableService,
  ) {}

  async syncAllReferences(): Promise<void> {
    console.log(
      "[ReferenceSync] Verifying foundational records in Airtable...",
    );

    const { activeUsers, activeProjects } = await this
      .getActiveNamesFromViews();

    if (activeUsers.length > 0) {
      await this.syncTable(
        SupabaseTables.CLOCKIFY_USERS,
        AIRTABLE_CONFIG.employeesTableId,
        AIRTABLE_FIELDS.FULL_NAME,
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
      this.supabase.from(SupabaseViews.MONTHLY_AGGREGATES).select(
        "user_name, project_name",
      ),
      this.supabase.from(SupabaseViews.PAYROLL_AGGREGATES).select(
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
      .from(SupabaseTables.CLOCKIFY_PROJECTS)
      .select("id, name, client_id, airtable_id")
      .in("name", activeProjectNames);

    if (error || !projects) return;

    const missingProjects = projects.filter((p) => !p.airtable_id);
    const activeClientIds = Array.from(
      new Set(
        projects.map((p) => p.client_id).filter((id): id is string =>
          Boolean(id)
        ),
      ),
    );

    await this.createMissingRecords(
      SupabaseTables.CLOCKIFY_PROJECTS,
      AIRTABLE_CONFIG.projectsTableId,
      AIRTABLE_FIELDS.NAME,
      missingProjects,
    );

    if (activeClientIds.length > 0) {
      const { data: missingClients } = await this.supabase
        .from(SupabaseTables.CLOCKIFY_CLIENTS)
        .select("id, name")
        .is("airtable_id", null)
        .in("id", activeClientIds);

      if (missingClients && missingClients.length > 0) {
        await this.createMissingRecords(
          SupabaseTables.CLOCKIFY_CLIENTS,
          AIRTABLE_CONFIG.clientsTableId,
          AIRTABLE_FIELDS.NAME,
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
      `[ReferenceSync] Creating ${records.length} missing records in ${supabaseTable}...`,
    );

    // Process up to 5 records concurrently
    const CONCURRENCY_LIMIT = 5;

    for (let i = 0; i < records.length; i += CONCURRENCY_LIMIT) {
      const chunk = records.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        chunk.map(async (record) => {
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
            const errorMessage = (err as Error).message;
            console.error(
              `[ReferenceSync] Failed to link ${record.name}:`,
              errorMessage,
            );
            throw new DownstreamSyncError(
              `Failed to link ${record.name} in Airtable: ${errorMessage}`,
            );
          }
        }),
      );
    }
  }

  // Pre-builds any required Project Assignments (e.g., "MotionAds - October 2025")
  // so they are available for mapping when the main numerical sync runs.
  async getOrBuildProjectAssignments(
    sourceRows: AggregateRow[],
  ): Promise<Map<string, string>> {
    console.log("[ReferenceSync] Verifying Project Assignments mapping...");
    const tableId = AIRTABLE_CONFIG.projectAssignmentsTableId;

    const existingRecords = await this.airtable.fetchRecords(
      tableId,
      SyncStrategies.PROJECT_ASSIGNMENT,
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
      const projects = rec.fields[AIRTABLE_FIELDS.PROJECT] as
        | string[]
        | undefined;
      const month = rec.fields[AIRTABLE_FIELDS.MONTH] as string | undefined;

      if (projects && projects.length > 0 && month) {
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

      const isoDate = formatMonthToIsoDate(row.month);

      const safeProjectId = row.airtable_project_id.trim();
      const key = `${safeProjectId}_${isoDate}`;

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
      `[ReferenceSync] Auto-generating ${missing.size} missing Project Assignments...`,
    );

    const missingEntries = Array.from(missing.entries());
    const CONCURRENCY_LIMIT = 5;

    for (let i = 0; i < missingEntries.length; i += CONCURRENCY_LIMIT) {
      const chunk = missingEntries.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        chunk.map(async ([key, data]) => {
          try {
            const newId = await this.airtable.createReferenceRecord(tableId, {
              [AIRTABLE_FIELDS.PROJECT]: [data.projectId],
              [AIRTABLE_FIELDS.MONTH]: data.isoDate,
              [AIRTABLE_FIELDS.COMMITMENT_HOURS]: 0,
              [AIRTABLE_FIELDS.HOURS_TO_BE_PAID]: 0,
              [AIRTABLE_FIELDS.ORIGINAL_INVOICE_AMOUNT]: 0,
            });
            idMap.set(key, newId);
          } catch (err: unknown) {
            const errorMessage = (err as Error).message;
            console.error(
              `[ReferenceSync] Failed to create Project Assignment ${key}:`,
              errorMessage,
            );
            throw new DownstreamSyncError(
              `Failed to create Project Assignment ${key} in Airtable: ${errorMessage}`,
            );
          }
        }),
      );
    }
  }
}
