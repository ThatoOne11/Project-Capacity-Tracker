import { SyncReportStats } from "../../_shared/types/types.ts";

export class SyncUtils {
  static initializeStats(): SyncReportStats {
    return {
      durationSeconds: 0,
      upserted: 0,
      deleted: 0,
      usersScanned: 0,
      status: "SUCCESS",
      newUsers: [],
      renamedUsers: [],
      newProjects: [],
      newClients: [],
    };
  }

  static calculateStartDate(lookbackDays: number): string {
    const now = new Date();
    return new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
      .toISOString();
  }

  static finalizeStats(stats: SyncReportStats, startTime: number): void {
    stats.durationSeconds = parseFloat(
      ((performance.now() - startTime) / 1000).toFixed(2),
    );
  }
}
