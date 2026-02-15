import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AirtableService } from "./services/airtable.service.ts";
import { AggregateRow } from "./types/types.ts";
import { AirtableDiffCalculator } from "./logic/diff.calculator.ts";
import { AIRTABLE_CONFIG, SUPABASE_CONFIG } from "../_shared/config.ts";

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
    const airtable = new AirtableService(
      AIRTABLE_CONFIG.pat,
      AIRTABLE_CONFIG.baseId,
      AIRTABLE_CONFIG.tableId,
    );

    // 1. Fetch Supabase View Data
    const { data: sourceData, error: dbError } = await supabase
      .from("monthly_aggregates_view")
      .select("*");

    if (dbError) throw new Error(`Supabase Error: ${dbError.message}`);

    // 2. Fetch Airtable Data
    const destinationRecords = await airtable.fetchRecords();

    // 3. Process Differences
    const { updates, stats } = AirtableDiffCalculator.calculateDiffs(
      sourceData as AggregateRow[],
      destinationRecords,
    );

    // 4. Execute Updates
    if (updates.length > 0) {
      await airtable.updateRecords(updates);
    }

    return new Response(JSON.stringify({ success: true, stats }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`Sync Error: ${error.message}`);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
