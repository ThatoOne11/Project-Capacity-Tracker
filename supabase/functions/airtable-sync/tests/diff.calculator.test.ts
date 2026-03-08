import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { AirtableDiffCalculator } from "../logic/diff.calculator.ts";
import { AggregateRow } from "../types/sync.types.ts";
import { AIRTABLE_FIELDS } from "../constants/airtable.constants.ts";
import { SyncStrategies } from "../constants/sync.consts.ts";
import { AirtableRecord, SyncJob } from "../types/airtable.types.ts";

Deno.test("AirtableDiffCalculator - Payroll Strategy", async (t) => {
  const job: SyncJob = {
    name: "Payroll Test",
    sourceView: "payroll_view",
    destinationTableId: "tbl123",
    allowInserts: true,
    strategy: SyncStrategies.PAYROLL,
  };

  await t.step("Creates insert payload for missing Airtable record", () => {
    const sourceRows: AggregateRow[] = [
      {
        airtable_user_id: "recUser1",
        user_name: "Jess Shepherd",
        airtable_project_id: "recProject1",
        project_name: "MotionAds",
        month: "February 2026",
        total_hours: "15.5",
      },
    ];

    const { inserts, updates, stats } = AirtableDiffCalculator.calculateDiffs(
      sourceRows,
      [],
      job,
    );

    assertEquals(stats.inserted, 1);
    assertEquals(inserts.length, 1);
    assertEquals(updates.length, 0);
    assertEquals(inserts[0].fields[AIRTABLE_FIELDS.ACTUAL_HOURS], 15.5);
  });

  await t.step("Creates update payload when hours differ", () => {
    const sourceRows: AggregateRow[] = [
      {
        airtable_user_id: "recUser1",
        user_name: "Jess Shepherd",
        airtable_project_id: "recProject1",
        project_name: "MotionAds",
        month: "February 2026",
        total_hours: "20.0",
      },
    ];

    const existingRecords: AirtableRecord[] = [
      {
        id: "recExistingAirtable1",
        fields: {
          [AIRTABLE_FIELDS.USER]: ["recUser1"],
          [AIRTABLE_FIELDS.PROJECT]: ["recProject1"],
          [AIRTABLE_FIELDS.MONTH]: "February 2026",
          [AIRTABLE_FIELDS.ACTUAL_HOURS]: 15.5,
        },
      },
    ];

    const { inserts, updates, stats } = AirtableDiffCalculator.calculateDiffs(
      sourceRows,
      existingRecords,
      job,
    );

    assertEquals(stats.updated, 1);
    assertEquals(updates.length, 1);
    assertEquals(inserts.length, 0);
    assertEquals(updates[0].fields[AIRTABLE_FIELDS.ACTUAL_HOURS], 20.0);
  });
});

Deno.test("AirtableDiffCalculator - Assignment Strategy (Shields & Auto-Healing)", async (t) => {
  const job: SyncJob = {
    name: "Assignment Test",
    sourceView: "assignment_view",
    destinationTableId: "tbl456",
    allowInserts: true,
    strategy: SyncStrategies.ASSIGNMENT,
  };

  await t.step("Shields against entries missing a project ID", () => {
    const sourceRows: AggregateRow[] = [
      {
        airtable_user_id: "recUser1",
        user_name: "Jess Shepherd",
        airtable_project_id: null,
        project_name: "No Project",
        month: "February 2026",
        total_hours: "5.0",
      },
    ];

    const { inserts, stats } = AirtableDiffCalculator.calculateDiffs(
      sourceRows,
      [],
      job,
    );

    // Should gracefully skip the row without attempting an insert
    assertEquals(stats.skipped, 1);
    assertEquals(inserts.length, 0);
  });

  await t.step(
    "Auto-heals missing 'Assigned Hours' to prevent formula crashes",
    () => {
      const sourceRows: AggregateRow[] = [
        {
          airtable_user_id: "recUser1",
          user_name: "Jess Shepherd",
          airtable_project_id: "recProject1",
          project_name: "MotionAds",
          month: "February 2026",
          total_hours: "10.0",
        },
      ];

      // Simulate map containing the pre-built project assignment
      const projectAssignmentMap = new Map<string, string>();
      projectAssignmentMap.set("recProject1_2026-02-01", "recProjAssig1");

      const existingRecords: AirtableRecord[] = [
        {
          id: "recExistingAirtable1",
          fields: {
            [AIRTABLE_FIELDS.PERSON]: ["recUser1"],
            [AIRTABLE_FIELDS.PROJECT_ASSIGNMENT]: ["recProjAssig1"],
            [AIRTABLE_FIELDS.ACTUAL_HOURS]: 10.0,
          },
        },
      ];

      const { updates, stats } = AirtableDiffCalculator.calculateDiffs(
        sourceRows,
        existingRecords,
        job,
        projectAssignmentMap,
      );

      assertEquals(stats.updated, 1);
      assertEquals(updates[0].fields[AIRTABLE_FIELDS.ASSIGNED_HOURS], 0);
    },
  );
});
