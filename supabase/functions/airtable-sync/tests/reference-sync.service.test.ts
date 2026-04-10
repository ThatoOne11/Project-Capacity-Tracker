import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ReferenceSyncService } from "../services/reference-sync.service.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { AirtableService } from "../services/airtable.service.ts";
import { SlackService } from "../../_shared/services/slack.service.ts";

Deno.test("ReferenceSyncService - Auto-Healing & Conflict Suite", async (t) => {
  let createdRecordCount = 0;
  let savedAirtableId = "";
  let slackAutoHealSent = false;
  let slackAlertSent = false;

  const mockRefRepo = {
    saveAirtableId: (_table: string, _recordId: string, airtableId: string) => {
      savedAirtableId = airtableId;
      return Promise.resolve();
    },
  } as unknown as ReferenceRepository;

  let mockAirtableRecords: Array<{ id: string; name: string }> = [];
  const mockAirtable = {
    fetchAllReferenceRecords: () => Promise.resolve(mockAirtableRecords),
    createReferenceRecord: () => {
      createdRecordCount++;
      return Promise.resolve("recBrandNew");
    },
  } as unknown as AirtableService;

  const mockSlack = {
    sendAutoHealReport: () => {
      slackAutoHealSent = true;
      return Promise.resolve();
    },
    sendAlert: () => {
      slackAlertSent = true;
      return Promise.resolve();
    },
  } as unknown as SlackService;

  const service = new ReferenceSyncService(
    mockRefRepo,
    mockAirtable,
    mockSlack,
  );

  // Reset helper called before each step to guarantee test isolation.
  const reset = (): void => {
    createdRecordCount = 0;
    savedAirtableId = "";
    slackAutoHealSent = false;
    slackAlertSent = false;
  };

  await t.step(
    "1. AUTO-HEALs and skips creation when exactly one normalized name matches",
    async () => {
      reset();
      mockAirtableRecords = [{ id: "recRossManualBoco", name: "Boco" }];

      await service["createMissingRecords"](
        "clockify_projects",
        "tblProjects",
        "Name",
        [{ id: "uuid-123", name: " BOCO " }],
      );

      assertEquals(createdRecordCount, 0);
      assertEquals(savedAirtableId, "recRossManualBoco");
      assertEquals(slackAutoHealSent, true);
      assertEquals(slackAlertSent, false);
    },
  );

  await t.step(
    "2. CREATEs a new Airtable record when the name truly does not exist",
    async () => {
      reset();
      mockAirtableRecords = [{ id: "recRossManualBoco", name: "Boco" }];

      await service["createMissingRecords"](
        "clockify_projects",
        "tblProjects",
        "Name",
        [{ id: "uuid-456", name: "Completely New Project" }],
      );

      assertEquals(createdRecordCount, 1);
      assertEquals(savedAirtableId, "recBrandNew");
      assertEquals(slackAutoHealSent, false);
      assertEquals(slackAlertSent, false);
    },
  );

  await t.step(
    "3. ABORTs and sends a Slack ALERT when human duplicates exist in Airtable",
    async () => {
      reset();
      mockAirtableRecords = [
        { id: "recDuplicate1", name: "Boco" },
        { id: "recDuplicate2", name: "BOCO " },
      ];

      await service["createMissingRecords"](
        "clockify_projects",
        "tblProjects",
        "Name",
        [{ id: "uuid-123", name: "boco" }],
      );

      assertEquals(
        createdRecordCount,
        0,
        "Should not create a third duplicate",
      );
      assertEquals(savedAirtableId, "", "Should not link to either ID");
      assertEquals(
        slackAutoHealSent,
        false,
        "Should not log a successful heal",
      );
      assertEquals(slackAlertSent, true, "MUST trigger a critical Slack alert");
    },
  );
});
