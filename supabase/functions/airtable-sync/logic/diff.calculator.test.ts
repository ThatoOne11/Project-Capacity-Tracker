import { assertEquals } from "jsr:@std/assert";
import { AirtableDiffCalculator } from "./diff.calculator.ts";
import { AggregateRow, AirtableRecord } from "../types/types.ts";

Deno.test("AirtableDiffCalculator - V2 ID-Based Test Suite", async (t) => {
  await t.step(
    "1. It should generate an UPDATE when hours differ based on Record IDs",
    () => {
      const sourceRows: AggregateRow[] = [
        {
          airtable_user_id: "rec_user1",
          user_name: "Ross Nelson",
          airtable_project_id: "rec_proj1",
          project_name: "BlueWorx",
          month: "January 2026",
          total_hours: "10.50",
        },
      ];

      // Airtable returns Linked Records as Arrays of strings
      const destinationRecords: AirtableRecord[] = [
        {
          id: "rec_airtable_row_1",
          fields: {
            "User": ["rec_user1"],
            "Project": ["rec_proj1"],
            "Month": "January 2026",
            "Actual Hours": 8.00,
          },
        },
      ];

      const result = AirtableDiffCalculator.calculateDiffs(
        sourceRows,
        destinationRecords,
        false,
      );

      assertEquals(result.updates.length, 1);
      assertEquals(result.updates[0].id, "rec_airtable_row_1");
      assertEquals(result.updates[0].fields["Actual Hours"], 10.50);
      assertEquals(result.stats.updated, 1);
    },
  );

  await t.step("2. It should SKIP when hours are identical", () => {
    const sourceRows: AggregateRow[] = [
      {
        airtable_user_id: "rec_user2",
        user_name: "Tinashe",
        airtable_project_id: "rec_proj2",
        project_name: "MotionAds",
        month: "February 2026",
        total_hours: "40.00",
      },
    ];
    const destinationRecords: AirtableRecord[] = [
      {
        id: "rec_airtable_row_2",
        fields: {
          "User": ["rec_user2"],
          "Project": ["rec_proj2"],
          "Month": "February 2026",
          "Actual Hours": 40.00,
        },
      },
    ];

    const result = AirtableDiffCalculator.calculateDiffs(
      sourceRows,
      destinationRecords,
      false,
    );

    assertEquals(result.updates.length, 0);
    assertEquals(result.stats.skipped, 1);
  });

  await t.step(
    "3. It should generate an INSERT with ID Arrays when allowInserts is true",
    () => {
      const sourceRows: AggregateRow[] = [
        {
          airtable_user_id: "rec_user3",
          user_name: "Msizi",
          airtable_project_id: "rec_proj3",
          project_name: "Internal",
          month: "February 2026",
          total_hours: "5.25",
        },
      ];
      // Empty destination - record doesn't exist yet
      const destinationRecords: AirtableRecord[] = [];

      const result = AirtableDiffCalculator.calculateDiffs(
        sourceRows,
        destinationRecords,
        true,
      );

      assertEquals(result.inserts.length, 1);
      // STRICT CHECK: Must be an Array of IDs now, not a string!
      assertEquals(result.inserts[0].fields.User, ["rec_user3"]);
      assertEquals(result.inserts[0].fields.Project, ["rec_proj3"]);
      assertEquals(result.inserts[0].fields["Actual Hours"], 5.25);
      assertEquals(result.stats.inserted, 1);
    },
  );

  await t.step(
    "4. SAFETY CHECK: It should block inserts if the Supabase row is missing an Airtable ID",
    () => {
      const sourceRows: AggregateRow[] = [
        {
          airtable_user_id: null, // Uh oh, Phase 1 Reference Sync failed to get an ID!
          user_name: "New Guy",
          airtable_project_id: "rec_proj4",
          project_name: "Internal",
          month: "February 2026",
          total_hours: "5.25",
        },
      ];
      const destinationRecords: AirtableRecord[] = [];

      const result = AirtableDiffCalculator.calculateDiffs(
        sourceRows,
        destinationRecords,
        true,
      );

      // It should refuse to insert and flag it as missing to prevent a malformed API call
      assertEquals(result.inserts.length, 0);
      assertEquals(result.stats.missing, 1);
    },
  );

  await t.step(
    "5. It should ZERO OUT Airtable records that no longer exist in Supabase",
    () => {
      // Supabase has NO records
      const sourceRows: AggregateRow[] = [];

      // Airtable has an old record with 15 hours
      const destinationRecords: AirtableRecord[] = [
        {
          id: "rec_old_row",
          fields: {
            "User": ["rec_deleted_user"],
            "Project": ["rec_deleted_project"],
            "Month": "January 2026",
            "Actual Hours": 15.00,
          },
        },
      ];

      const result = AirtableDiffCalculator.calculateDiffs(
        sourceRows,
        destinationRecords,
        false,
      );

      assertEquals(result.updates.length, 1);
      assertEquals(result.updates[0].id, "rec_old_row");
      assertEquals(result.updates[0].fields["Actual Hours"], 0); // Must be zeroed out
      assertEquals(result.stats.updated, 1);
    },
  );
});
