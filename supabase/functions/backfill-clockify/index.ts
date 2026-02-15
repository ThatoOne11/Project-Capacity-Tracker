import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ClockifyService } from "../_shared/services/clockify.service.ts";
import { SupabaseRepository } from "../_shared/repo/supabase.repo.ts";

const ENV = {
  CLOCKIFY_KEY: Deno.env.get("CLOCKIFY_KEY")!,
  WORKSPACE_ID: Deno.env.get("WORKSPACE_ID")!,
  SUPABASE_URL: Deno.env.get("SUPABASE_URL")!,
  SUPABASE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
};

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_KEY);
    const clockifyService = new ClockifyService(
      ENV.CLOCKIFY_KEY,
      ENV.WORKSPACE_ID,
    );
    const repo = new SupabaseRepository(supabase);

    const body = await req.json().catch(() => ({}));
    const startDate = body.startDate || "2026-01-01T00:00:00Z";
    const targetUserId: string | undefined = body.userId;

    console.log(
      `Backfill Started. Mode: ${
        targetUserId ? "Single User" : "Full Workspace"
      }`,
    );

    // 1. Sync Reference Data
    await repo.upsertUsers(await clockifyService.fetchUsers());
    await repo.upsertClients(await clockifyService.fetchClients());
    await repo.upsertProjects(await clockifyService.fetchProjects());

    // 2. Identify target users
    let userQuery = supabase.from("clockify_users").select("clockify_id, name");
    if (targetUserId) {
      userQuery = userQuery.eq("clockify_id", targetUserId);
    }

    const { data: dbUsers, error: userError } = await userQuery;
    if (userError || !dbUsers) {
      throw new Error(userError?.message || "Users not found");
    }

    let totalSynced = 0;

    // 3. Orchestrate Time Entry Sync
    for (const user of dbUsers) {
      console.log(`👤 Syncing: ${user.name}`);
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const entries = await clockifyService.fetchUserTimeEntries(
          user.clockify_id,
          startDate,
          page,
        );

        if (!entries || entries.length === 0) {
          hasMore = false;
          break;
        }

        const result = await repo.processTimeEntriesBatch(entries);
        totalSynced += result.synced;

        page++;
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced: totalSynced }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Backfill Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
