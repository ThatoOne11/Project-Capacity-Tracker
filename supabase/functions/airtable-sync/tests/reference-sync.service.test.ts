import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ReferenceSyncService } from "../services/reference-sync.service.ts";

type RefSyncArgs = ConstructorParameters<typeof ReferenceSyncService>;

Deno.test("ReferenceSyncService - Auto-Healing Suite", async (t) => {
  let createdRecordCount = 0;
  let updatedSupabaseId = "";
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

  // 2. Mock Airtable (Pretends Airtable already has "boco")
  const mockAirtable = {
    fetchAllReferenceRecords: () =>
      Promise.resolve([
        { id: "recRossManualBoco", name: "Boco" },
      ]),
    createReferenceRecord: () => {
      createdRecordCount++;
      return Promise.resolve("recBrandNew");
    },
  } as unknown as RefSyncArgs[1];

  // 3. Mock Slack (Verifies visibility)
  const mockSlack = {
    sendInfo: () => {
      slackAlertSent = true;
      return Promise.resolve();
    },
  } as unknown as RefSyncArgs[2];

  const service = new ReferenceSyncService(
    mockSupabase,
    mockAirtable,
    mockSlack,
  );

  await t.step(
    "1. It should AUTO-HEAL and skip creation if normalized names match",
    async () => {
      // Reset counters
      createdRecordCount = 0;
      slackAlertSent = false;

      // Simulate the Sync asking to resolve a project with messy spacing/casing
      await service["createMissingRecords"](
        "clockify_projects",
        "tblProjects",
        "Name",
        [{ id: "uuid-123", name: " BOCO " }],
      );

      // ASSERTIONS:
      // Did we skip Airtable creation?
      assertEquals(createdRecordCount, 0);
      // Did we steal Ross's ID?
      assertEquals(updatedSupabaseId, "recRossManualBoco");
      // Did we tell the team?
      assertEquals(slackAlertSent, true);
    },
  );

  await t.step(
    "2. It should CREATE a new record if it truly does not exist",
    async () => {
      // Reset counters
      createdRecordCount = 0;
      slackAlertSent = false;

      await service["createMissingRecords"](
        "clockify_projects",
        "tblProjects",
        "Name",
        [{ id: "uuid-456", name: "Completely New Project" }],
      );

      // ASSERTIONS:
      // Did it create the record in Airtable?
      assertEquals(createdRecordCount, 1);
      // Did it link the brand new ID?
      assertEquals(updatedSupabaseId, "recBrandNew");
      // It should NOT send a Slack info alert for standard creations
      assertEquals(slackAlertSent, false);
    },
  );
});
