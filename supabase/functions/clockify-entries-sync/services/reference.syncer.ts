import { ClockifyService } from "../../_shared/services/clockify.service.ts";
import { ReferenceRepository } from "../../_shared/repo/reference.repo.ts";
import { SyncReportStats } from "../../_shared/types/sync.types.ts";

export class ReferenceSyncer {
  constructor(
    private readonly clockify: ClockifyService,
    private readonly repo: ReferenceRepository,
  ) {}

  async syncReferences(stats: SyncReportStats): Promise<void> {
    // 1. Sync Users (Added + Renamed)
    const users = await this.clockify.fetchUsers();
    const userResult = await this.repo.upsertUsers(users);

    stats.newUsers = userResult.added;
    stats.renamedUsers = userResult.renamed;

    // 2. Sync Clients
    const clients = await this.clockify.fetchClients();
    stats.newClients = await this.repo.upsertClients(clients);

    // 3. Sync Projects
    const projects = await this.clockify.fetchProjects();
    stats.newProjects = await this.repo.upsertProjects(projects);

    // Logging
    const totalChanges = stats.newUsers.length + stats.renamedUsers.length +
      stats.newProjects.length + stats.newClients.length;

    if (totalChanges > 0) {
      console.log(`Reference Changes detected: ${totalChanges}`);
    }
  }
}
