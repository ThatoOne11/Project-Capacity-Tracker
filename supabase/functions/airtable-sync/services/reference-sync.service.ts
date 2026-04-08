import { AirtableService } from "./airtable.service.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { AIRTABLE_CONFIG } from "../../_shared/config.ts";
import { AggregateRow } from "../types/sync.types.ts";
import { ReferenceRecord } from "../../_shared/types/sync.types.ts";
import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";
import { SyncStrategies } from "../constants/sync.consts.ts";
import {
  ReferenceTableName,
  SupabaseTables,
} from "../../_shared/constants/supabase.constants.ts";
import { AirtableRecord } from "../types/airtable.types.ts";
import { formatMonthToIsoDate } from "../../_shared/utils/date.utils.ts";
import { DownstreamSyncError } from "../../_shared/exceptions/custom.exceptions.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";

export class ReferenceSyncService {
  constructor(
    private readonly refRepo: ReferenceRepository,
    private readonly airtable: AirtableService,
    private readonly slack: SlackService,
  ) {}

  // Ensures all relational dependencies (Users, Clients, Projects) exist in
  // Airtable before the numerical sync runs.
  async syncAllReferences(
    activeUsers: string[],
    activeProjects: string[],
  ): Promise<void> {
    console.log(
      "[ReferenceSync] Verifying foundational records in Airtable...",
    );

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

  private async syncProjectsAndClients(
    activeProjectNames: string[],
  ): Promise<void> {
    const projects = await this.refRepo.fetchProjectsByNames(
      activeProjectNames,
    );
    const missingProjects = projects.filter((p) => !p.airtable_id);

    const activeClientIds = Array.from(
      new Set(
        projects
          .map((p) => p.client_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    await this.createMissingRecords(
      SupabaseTables.CLOCKIFY_PROJECTS,
      AIRTABLE_CONFIG.projectsTableId,
      AIRTABLE_FIELDS.NAME,
      missingProjects,
    );

    if (activeClientIds.length > 0) {
      const missingClients = await this.refRepo.fetchMissingClientsByIds(
        activeClientIds,
      );
      if (missingClients.length > 0) {
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
    supabaseTable: ReferenceTableName,
    airtableTableId: string,
    airtableNameField: string,
    activeNames: string[],
  ): Promise<void> {
    const missingRecords = await this.refRepo.fetchMissingReferencesByNames(
      supabaseTable,
      activeNames,
    );

    if (missingRecords.length === 0) return;

    await this.createMissingRecords(
      supabaseTable,
      airtableTableId,
      airtableNameField,
      missingRecords,
    );
  }

  // Helper to safely compare human-entered names against Clockify names
  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  private async createMissingRecords(
    supabaseTable: ReferenceTableName,
    airtableTableId: string,
    airtableNameField: string,
    records: ReferenceRecord[],
  ): Promise<void> {
    if (records.length === 0) return;

    console.log(
      `[ReferenceSync] Resolving ${records.length} record(s) in ${supabaseTable}...`,
    );

    // 1. Fetch all existing records from Airtable to build the Normalized Map
    const existingAirtableRecords = await this.airtable
      .fetchAllReferenceRecords(
        airtableTableId,
        airtableNameField,
      );

    const normalizedMap = new Map<string, string>();
    const conflictedNames = new Set<string>();

    for (const rec of existingAirtableRecords) {
      const normalized = this.normalizeName(rec.name);

      if (conflictedNames.has(normalized)) continue;

      if (normalizedMap.has(normalized)) {
        normalizedMap.delete(normalized);
        conflictedNames.add(normalized);
      } else {
        normalizedMap.set(normalized, rec.id);
      }
    }

    const CONCURRENCY_LIMIT = 5;

    for (let i = 0; i < records.length; i += CONCURRENCY_LIMIT) {
      const chunk = records.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        chunk.map(async (record) => {
          try {
            const normalizedSupabaseName = this.normalizeName(record.name);

            // Refuse to process if duplicates exist in Airtable
            if (conflictedNames.has(normalizedSupabaseName)) {
              const msg =
                `Multiple records found in Airtable for *${record.name}*. Cannot safely auto-heal or sync. Please delete the duplicates in Airtable.`;
              console.warn(`[ReferenceSync] ${msg}`);

              await this.slack.sendAlert("Airtable Data Conflict", msg);

              return; // Skip processing this specific record
            }

            // 2. Check if record has been already created manually
            let targetAirtableId = normalizedMap.get(normalizedSupabaseName);

            if (targetAirtableId) {
              // AUTO-HEAL: Match found!
              const msg =
                `Auto-healed link for existing record: *${record.name}* (${targetAirtableId})`;
              console.log(`[ReferenceSync] ${msg}`);

              // Send Slack alert
              await this.slack.sendInfo("Airtable Auto-Heal Applied", msg);
            } else {
              targetAirtableId = await this.airtable.createReferenceRecord(
                airtableTableId,
                { [airtableNameField]: record.name },
              );
              console.log(
                `[ReferenceSync] Created & Linked: ${record.name} (${targetAirtableId})`,
              );
            }

            await this.refRepo.saveAirtableId(
              supabaseTable,
              record.id,
              targetAirtableId,
            );
          } catch (err: unknown) {
            const errorMessage = (err as Error).message;
            console.error(
              `[ReferenceSync] Failed to process ${record.name}:`,
              errorMessage,
            );
            throw new DownstreamSyncError(
              `Failed to process ${record.name} in Airtable: ${errorMessage}`,
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

      const safeProjectId = row.airtable_project_id.trim();
      const isoDate = formatMonthToIsoDate(row.month);
      const key = `${safeProjectId}_${isoDate}`;

      if (!existingMap.has(key) && !missing.has(key)) {
        missing.set(key, { projectId: safeProjectId, isoDate });
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
      `[ReferenceSync] Auto-generating ${missing.size} missing Project Assignment(s)...`,
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
            throw new DownstreamSyncError(
              `Failed to create Project Assignment ${key} in Airtable: ${errorMessage}`,
            );
          }
        }),
      );
    }
  }
}
