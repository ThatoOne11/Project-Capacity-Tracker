import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SupabaseViewName,
  SupabaseViews,
} from "../../_shared/constants/supabase.constants.ts";
import { AggregateRow, ViewRow } from "../types/sync.types.ts";

export class AggregateRepository {
  constructor(private readonly client: SupabaseClient) {}

  // Scans both aggregate views to build the set of active user and project
  // names. Called once per sync cycle so the reference sync knows what
  // records must exist in Airtable before numerical data is pushed.
  async fetchActiveNamesFromViews(): Promise<{
    activeUsers: string[];
    activeProjects: string[];
  }> {
    const users = new Set<string>();
    const projects = new Set<string>();

    const [monthly, payroll] = await Promise.all([
      this.client
        .from(SupabaseViews.MONTHLY_AGGREGATES)
        .select("user_name, project_name"),
      this.client
        .from(SupabaseViews.PAYROLL_AGGREGATES)
        .select("user_name, project_name"),
    ]);

    const processRows = (rows: ViewRow[] | null): void => {
      if (!rows) return;
      for (const row of rows) {
        if (row.user_name) users.add(row.user_name);
        if (row.project_name) projects.add(row.project_name);
      }
    };

    processRows(monthly.data as ViewRow[] | null);
    processRows(payroll.data as ViewRow[] | null);

    return {
      activeUsers: Array.from(users),
      activeProjects: Array.from(projects),
    };
  }

  async fetchAggregateView(view: SupabaseViewName): Promise<AggregateRow[]> {
    const { data, error } = await this.client.from(view).select("*");

    if (error) throw new Error(`DB Error (${view}): ${error.message}`);
    return (data ?? []) as AggregateRow[];
  }
}
