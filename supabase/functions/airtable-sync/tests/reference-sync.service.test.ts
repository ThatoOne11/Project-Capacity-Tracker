import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ReferenceSyncService } from "../services/reference-sync.service.ts";

type RefSyncArgs = ConstructorParameters<typeof ReferenceSyncService>;

Deno.test("ReferenceSyncService - Auto-Healing & Conflict Suite", async (t) => {
  let createdRecordCount = 0;
  let updatedSupabaseId = "";
  let slackInfoSent = false;
  let slackAlertSent = false;

  // 1. Mock Supabase (Catches the auto-healed ID)
  const mockSupabase = {
    from: () => ({
      update: (payload: { airtable_id: string }) => ({
        eq: (_col: string, _val: string) => {
          updatedSupabaseId = payload.airtable_id;
          return Promise.resolve({ error: null });
        },
      }),
    }),
  } as unknown as RefSyncArgs[0];

  // 2. Mock Airtable (Configurable per test)
  let mockAirtableRecords: { id: string; name: string }[] = [];
  const mockAirtable = {
    fetchAllReferenceRecords: () => Promise.resolve(mockAirtableRecords),
    createReferenceRecord: () => {
      createdRecordCount++;
      return Promise.resolve("recBrandNew");
    },
  } as unknown as RefSyncArgs[1];

  // 3. Mock Slack (Verifies visibility & critical alerts)
  const mockSlack = {
    sendInfo: () => {
      slackInfoSent = true;
      return Promise.resolve();
    },
    sendAlert: () => {
      slackAlertSent = true;
      return Promise.resolve();
    },
  } as unknown as RefSyncArgs[2];

  const service = new ReferenceSyncService(
    mockSupabase,
    mockAirtable,
    mockSlack,
  );

  // --- TESTS ---

  await t.step(
    "1. It should AUTO-HEAL and skip creation if exactly one normalized name matches",
    async () => {
      createdRecordCount = 0;
      updatedSupabaseId = "";
      slackInfoSent = false;
      slackAlertSent = false;

      // Airtable has exactly ONE "Boco"
      mockAirtableRecords = [{ id: "recRossManualBoco", name: "Boco" }];

      await service["createMissingRecords"](
        "clockify_projects",
        "tblProjects",
        "Name",
        [{ id: "uuid-123", name: " BOCO " }],
      );

      assertEquals(createdRecordCount, 0);
      assertEquals(updatedSupabaseId, "recRossManualBoco");
      assertEquals(slackInfoSent, true); // Logged the heal
      assertEquals(slackAlertSent, false); // No critical error
    },
  );

  await t.step(
    "2. It should CREATE a new record if it truly does not exist",
    async () => {
      createdRecordCount = 0;
      updatedSupabaseId = "";
      slackInfoSent = false;
      slackAlertSent = false;

      mockAirtableRecords = [{ id: "recRossManualBoco", name: "Boco" }];

      await service["createMissingRecords"](
        "clockify_projects",
        "tblProjects",
        "Name",
        [{ id: "uuid-456", name: "Completely New Project" }],
      );

      assertEquals(createdRecordCount, 1);
      assertEquals(updatedSupabaseId, "recBrandNew");
      assertEquals(slackInfoSent, false);
      assertEquals(slackAlertSent, false);
    },
  );

  await t.step(
    "3. It should ABORT safely and ALERT Slack if human duplicates exist in Airtable",
    async () => {
      createdRecordCount = 0;
      updatedSupabaseId = "";
      slackInfoSent = false;
      slackAlertSent = false;

      // Airtable has TWO records that normalize to "boco"
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

      // ASSERTIONS:
      // It MUST NOT guess which ID to use. It must skip everything.
      assertEquals(
        createdRecordCount,
        0,
        "Should not create a third duplicate",
      );
      assertEquals(updatedSupabaseId, "", "Should not link to either ID");
      assertEquals(slackInfoSent, false, "Should not log a successful heal");
      assertEquals(slackAlertSent, true, "MUST trigger a critical Slack alert");
    },
  );
});
