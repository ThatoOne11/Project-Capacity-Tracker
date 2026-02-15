import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AirtableService } from "./services/airtable.service.ts";
import { AggregateRow } from "./types/types.ts";
import { SyncEngine } from "./engine/sync.engine.ts";

const ENV = {
  AIRTABLE_PAT: Deno.env.get("AIRTABLE_PAT")!,
  AIRTABLE_BASE_ID: Deno.env.get("AIRTABLE_BASE_ID")!,
  AIRTABLE_TABLE_ID: Deno.env.get("AIRTABLE_TABLE_ID")!,
  SUPABASE_URL: Deno.env.get("SUPABASE_URL")!,
  SUPABASE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
};

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_KEY);
    const airtable = new AirtableService(
      ENV.AIRTABLE_PAT,
      ENV.AIRTABLE_BASE_ID,
      ENV.AIRTABLE_TABLE_ID,
    );

    // 1. Fetch Supabase View Data
    const { data: sourceData, error: dbError } = await supabase
      .from("monthly_aggregates_view")
      .select("*");

    if (dbError) throw new Error(`Supabase Error: ${dbError.message}`);

    // 2. Fetch Airtable Data
    const destinationRecords = await airtable.fetchRecords();

    // 3. Process Differences
    const { updates, stats } = SyncEngine.prepareUpdates(
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
