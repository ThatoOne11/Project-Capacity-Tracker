import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SyncOrchestratorService } from "../services/sync-orchestrator.service.ts";
import { AirtableDiffCalculator } from "../logic/diff.calculator.ts";
import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";
import { AirtableUpdate } from "../types/airtable.types.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";

type OrchestratorArgs = ConstructorParameters<typeof SyncOrchestratorService>;

// Minimal mock implementations
const mockSupabase = {
  from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
} as unknown as OrchestratorArgs[0];

const mockSlack = {
  sendInfo: () => Promise.resolve(),
} as unknown as OrchestratorArgs[1];

const mockReferenceSync = {
  syncAllReferences: () => Promise.resolve(),
  getOrBuildProjectAssignments: () =>
    Promise.resolve(new Map<string, string>()),
} as unknown as OrchestratorArgs[3];

const mockRefRepo = {} as unknown as ReferenceRepository;

Deno.test("SyncOrchestratorService - Execution & Ghost Buster Suite", async (t) => {
  await t.step(
    "1. Deduplicates updates targeting the same Airtable record ID",
    async () => {
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
        mockRefRepo,
      );

      await orchestrator.runAllJobs();

      assertEquals(capturedUpdates.length, 2);
      const duplicateRecord = capturedUpdates.find((u) =>
        u.id === "recDuplicate1"
      );
      assertEquals(duplicateRecord?.fields[AIRTABLE_FIELDS.ACTUAL_HOURS], 10);

      AirtableDiffCalculator.calculateDiffs = originalCalculateDiffs;
    },
  );

  await t.step(
    "2. Ghost Buster - Catches ROW_DOES_NOT_EXIST, delegates to Repo, and gracefully exits",
    async () => {
      let nullifiedId = "";

      // 1. Mock the Repository (No raw DB mocking needed!)
      const mockRefRepoGhost = {
        removeAirtableId: (id: string) => {
          nullifiedId = id;
          return Promise.resolve();
        },
      } as unknown as ReferenceRepository;

      // Mock Reference Sync to THROW a dictionary-approved error
      const mockFailingReferenceSync = {
        syncAllReferences: () =>
          Promise.reject(
            new Error(
              `Failed to process: {"error":{"type":"ROW_DOES_NOT_EXIST","message":"Record ID recDeadGhost12345 does not exist"}}`,
            ),
          ),
        getOrBuildProjectAssignments: () =>
          Promise.resolve(new Map<string, string>()),
      } as unknown as OrchestratorArgs[3];

      const mockAirtable = {} as unknown as OrchestratorArgs[2];

      const orchestrator = new SyncOrchestratorService(
        mockSupabase,
        mockSlack,
        mockAirtable,
        mockFailingReferenceSync,
        mockRefRepoGhost,
      );

      const result = await orchestrator.runAllJobs();

      // ASSERTIONS: Should exit gracefully, extract the exact ID, and pass it to the Repo
      assertEquals(result.details[0].includes("Sync aborted early"), true);
      assertEquals(nullifiedId, "recDeadGhost12345");
    },
  );

  await t.step(
    "3. Ghost Buster - IGNORES unrelated errors and safely throws them",
    async () => {
      // Mock Reference Sync to THROW an error NOT in our dictionary
      const mockFailingReferenceSync = {
        syncAllReferences: () =>
          Promise.reject(
            new Error(
              `Failed to process: {"error":{"type":"INVALID_PERMISSIONS","message":"Cannot modify recSafeRecord1234"}}`,
            ),
          ),
        getOrBuildProjectAssignments: () =>
          Promise.resolve(new Map<string, string>()),
      } as unknown as OrchestratorArgs[3];

      const mockAirtable = {} as unknown as OrchestratorArgs[2];

      const orchestrator = new SyncOrchestratorService(
        mockSupabase,
        mockSlack,
        mockAirtable,
        mockFailingReferenceSync,
        mockRefRepo,
      );

      // ASSERTIONS: The orchestrator MUST throw the error, not swallow it!
      await assertRejects(
        () => orchestrator.runAllJobs(),
        Error,
        "INVALID_PERMISSIONS",
      );
    },
  );
});
