import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SyncOrchestratorService } from "../services/sync-orchestrator.service.ts";
import { AirtableDiffCalculator } from "../logic/diff.calculator.ts";
import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";
import { AirtableUpdate } from "../types/airtable.types.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { AggregateRepository } from "../repo/aggregate.repo.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";
import { ReferenceSyncService } from "../services/reference-sync.service.ts";
import { AirtableService } from "../services/airtable.service.ts";

const mockSlack = {
  sendInfo: () => Promise.resolve(),
} as unknown as SlackService;

const mockAggregateRepo = {
  fetchActiveNamesFromViews: () =>
    Promise.resolve({ activeUsers: [], activeProjects: [] }),
  fetchAggregateView: () => Promise.resolve([]),
} as unknown as AggregateRepository;

const mockReferenceSync = {
  syncAllReferences: (_activeUsers: string[], _activeProjects: string[]) =>
    Promise.resolve(),
  getOrBuildProjectAssignments: () =>
    Promise.resolve(new Map<string, string>()),
} as unknown as ReferenceSyncService;

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
      } as unknown as AirtableService;

      const orchestrator = new SyncOrchestratorService(
        mockSlack,
        mockAirtable,
        mockReferenceSync,
        mockRefRepo,
        mockAggregateRepo,
      );

      await orchestrator.runAllJobs();

      assertEquals(capturedUpdates.length, 2);
      const deduped = capturedUpdates.find((u) => u.id === "recDuplicate1");
      // Last-write-wins: the second update (value: 10) should survive.
      assertEquals(deduped?.fields[AIRTABLE_FIELDS.ACTUAL_HOURS], 10);

      AirtableDiffCalculator.calculateDiffs = originalCalculateDiffs;
    },
  );

  await t.step(
    "2. Ghost Buster catches ROW_DOES_NOT_EXIST, nullifies the ID, and exits gracefully",
    async () => {
      let nullifiedId = "";

      const mockRefRepoGhost = {
        removeAirtableId: (id: string) => {
          nullifiedId = id;
          return Promise.resolve();
        },
      } as unknown as ReferenceRepository;

      const mockFailingReferenceSync = {
        syncAllReferences: (_au: string[], _ap: string[]) =>
          Promise.reject(
            new Error(
              `Failed: {"error":{"type":"ROW_DOES_NOT_EXIST","message":"Record ID recDeadGhost12345 does not exist"}}`,
            ),
          ),
        getOrBuildProjectAssignments: () =>
          Promise.resolve(new Map<string, string>()),
      } as unknown as ReferenceSyncService;

      const orchestrator = new SyncOrchestratorService(
        mockSlack,
        {} as unknown as AirtableService,
        mockFailingReferenceSync,
        mockRefRepoGhost,
        mockAggregateRepo,
      );

      const result = await orchestrator.runAllJobs();

      assertEquals(result.details[0].includes("Sync aborted early"), true);
      assertEquals(nullifiedId, "recDeadGhost12345");
    },
  );

  await t.step(
    "3. Ghost Buster ignores unrelated errors and re-throws them",
    async () => {
      const mockFailingReferenceSync = {
        syncAllReferences: (_au: string[], _ap: string[]) =>
          Promise.reject(
            new Error(
              `Failed: {"error":{"type":"INVALID_PERMISSIONS","message":"Cannot modify recSafeRecord1234"}}`,
            ),
          ),
        getOrBuildProjectAssignments: () =>
          Promise.resolve(new Map<string, string>()),
      } as unknown as ReferenceSyncService;

      const orchestrator = new SyncOrchestratorService(
        mockSlack,
        {} as unknown as AirtableService,
        mockFailingReferenceSync,
        mockRefRepo,
        mockAggregateRepo,
      );

      await assertRejects(
        () => orchestrator.runAllJobs(),
        Error,
        "INVALID_PERMISSIONS",
      );
    },
  );
});
