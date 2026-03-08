import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SyncOrchestratorService } from "../services/sync-orchestrator.service.ts";
import { AirtableDiffCalculator } from "../logic/diff.calculator.ts";
import { AirtableUpdate } from "../types/types.ts";
import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";

// Extract types dynamically to completely avoid the use of 'any'
type OrchestratorArgs = ConstructorParameters<typeof SyncOrchestratorService>;

// Minimal mock implementations to test orchestration flow without hitting real APIs
const mockSupabase = {
  from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
} as unknown as OrchestratorArgs[0];

const mockSlack = {} as unknown as OrchestratorArgs[1];

const mockReferenceSync = {
  syncAllReferences: () => Promise.resolve(),
  getOrBuildProjectAssignments: () =>
    Promise.resolve(new Map<string, string>()),
} as unknown as OrchestratorArgs[3];

Deno.test("SyncOrchestratorService - Execution Flow", async (t) => {
  await t.step(
    "Deduplicates updates targeting the same Airtable record ID",
    async () => {
      // Simulate the calculator returning duplicate updates for the same Airtable ID
      const originalCalculateDiffs = AirtableDiffCalculator.calculateDiffs;
      AirtableDiffCalculator.calculateDiffs = () => ({
        inserts: [],
        updates: [
          {
            id: "recDuplicate1",
            fields: { [AIRTABLE_FIELDS.ACTUAL_HOURS]: 5 },
          },
          {
            id: "recDuplicate1",
            fields: { [AIRTABLE_FIELDS.ACTUAL_HOURS]: 10 },
          },
          { id: "recUnique2", fields: { [AIRTABLE_FIELDS.ACTUAL_HOURS]: 2 } },
        ],
        stats: { updated: 3, inserted: 0, skipped: 0, missing: 0 },
      });

      let capturedUpdates: AirtableUpdate[] = [];
      const mockAirtable = {
        fetchRecords: () => Promise.resolve([]),
        updateRecords: (_tableId: string, updates: AirtableUpdate[]) => {
          capturedUpdates = updates;
          return Promise.resolve();
        },
        createRecords: () => Promise.resolve(),
      } as unknown as OrchestratorArgs[2];

      const orchestrator = new SyncOrchestratorService(
        mockSupabase,
        mockSlack,
        mockAirtable,
        mockReferenceSync,
      );

      // Execute the service
      await orchestrator.runAllJobs();

      // Verify deduplication: 3 updates went in, but only 2 unique IDs should be sent out
      assertEquals(capturedUpdates.length, 2);

      // It should keep the LAST update value for the duplicated record
      const duplicateRecord = capturedUpdates.find((u) =>
        u.id === "recDuplicate1"
      );
      assertEquals(duplicateRecord?.fields[AIRTABLE_FIELDS.ACTUAL_HOURS], 10);

      // Restore original function
      AirtableDiffCalculator.calculateDiffs = originalCalculateDiffs;
    },
  );
});
