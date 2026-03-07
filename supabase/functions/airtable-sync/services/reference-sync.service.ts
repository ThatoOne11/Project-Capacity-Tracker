import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AirtableService } from "./airtable.service.ts";
import { AIRTABLE_CONFIG } from "../../_shared/config.ts";

export class ReferenceSyncService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly airtable: AirtableService,
  ) {}

  async syncAllReferences(): Promise<void> {
    console.log("[ReferenceSync] Checking for missing Airtable IDs...");
    await this.syncTable(
      "clockify_clients",
      AIRTABLE_CONFIG.clientsTableId,
      "Name",
    );
    await this.syncTable(
      "clockify_users",
      AIRTABLE_CONFIG.employeesTableId,
      "Full Name",
    );
    await this.syncTable(
      "clockify_projects",
      AIRTABLE_CONFIG.projectsTableId,
      "Name",
    );
  }

  private async syncTable(
    supabaseTable: string,
    airtableTableId: string,
    airtableNameField: string,
  ): Promise<void> {
    // 1. Find all records missing an Airtable ID
    const { data: missingRecords, error } = await this.supabase
      .from(supabaseTable)
      .select("id, name")
      .is("airtable_id", null);

    if (error) throw new Error(`[ReferenceSync] DB Error: ${error.message}`);
    if (!missingRecords || missingRecords.length === 0) return;

    console.log(
      `[ReferenceSync] Found ${missingRecords.length} missing records in ${supabaseTable}. Creating...`,
    );

    // 2. Create in Airtable & Save ID to Supabase
    for (const record of missingRecords) {
      try {
        const newAirtableId = await this.airtable.createReferenceRecord(
          airtableTableId,
          {
            [airtableNameField]: record.name,
          },
        );

        const { error: updateErr } = await this.supabase
          .from(supabaseTable)
          .update({ airtable_id: newAirtableId })
          .eq("id", record.id);

        if (updateErr) throw updateErr;

        console.log(
          `[ReferenceSync] Created & Linked: ${record.name} (${newAirtableId})`,
        );
      } catch (err) {
        console.error(
          `[ReferenceSync] Failed to create/link ${record.name}:`,
          (err as Error).message,
        );
      }
    }
  }
}
