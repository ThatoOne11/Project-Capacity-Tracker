import { assertEquals } from "jsr:@std/assert";
import { AirtableDiffCalculator } from "./diff.calculator.ts";
import { AggregateRow, AirtableRecord } from "../types/types.ts";

Deno.test("AirtableDiffCalculator - Test Suite", async (t) => {
  await t.step("1. It should generate an UPDATE when hours differ", () => {
    const sourceRows: AggregateRow[] = [
      {
        user_name: "Ross Nelson",
        project_name: "BlueWorx",
        month: "January 2026",
        total_hours: "10.50",
      },
    ];
    const destinationRecords: AirtableRecord[] = [
      {
        id: "rec_1",
        fields: {
          "Name": "ross nelson - blueworx - january 2026",
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
    assertEquals(result.updates[0].id, "rec_1");
    assertEquals(result.updates[0].fields["Actual Hours"], 10.50);
    assertEquals(result.stats.updated, 1);
  });

  await t.step("2. It should SKIP when hours are identical", () => {
    const sourceRows: AggregateRow[] = [
      {
        user_name: "Tinashe",
        project_name: "MotionAds",
        month: "February 2026",
        total_hours: "40.00",
      },
    ];
    const destinationRecords: AirtableRecord[] = [
      {
        id: "rec_2",
        fields: {
          "Name": "tinashe - motionads - february 2026",
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
    "3. It should generate an INSERT when allowInserts is true",
    () => {
      const sourceRows: AggregateRow[] = [
        {
          user_name: "Msizi",
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
      assertEquals(result.inserts[0].fields.User, "Msizi");
      assertEquals(result.inserts[0].fields["Actual Hours"], 5.25);
      assertEquals(result.stats.inserted, 1);
    },
  );

  await t.step(
    "4. It should SKIP inserts and flag missing when allowInserts is false",
    () => {
      const sourceRows: AggregateRow[] = [
        {
          user_name: "Msizi",
          project_name: "Internal",
          month: "February 2026",
          total_hours: "5.25",
        },
      ];
      const destinationRecords: AirtableRecord[] = [];

      const result = AirtableDiffCalculator.calculateDiffs(
        sourceRows,
        destinationRecords,
        false,
      );

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
          id: "rec_old",
          fields: {
            "Name": "Ross Nelson - DeletedProject - January 2026",
            "Actual Hours": 15.00,
          },
        },
        {
          id: "rec_zero",
          fields: {
            "Name": "Tinashe - OldProject - January 2026",
            "Actual Hours": 0,
          },
        }, // Should be ignored since it's already 0
      ];

      const result = AirtableDiffCalculator.calculateDiffs(
        sourceRows,
        destinationRecords,
        false,
      );

      assertEquals(result.updates.length, 1);
      assertEquals(result.updates[0].id, "rec_old");
      assertEquals(result.updates[0].fields["Actual Hours"], 0); // Must be zeroed out
      assertEquals(result.stats.updated, 1);
    },
  );
});
