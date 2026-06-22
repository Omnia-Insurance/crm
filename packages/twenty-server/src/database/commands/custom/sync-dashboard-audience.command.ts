// OMNIA-CUSTOM: Dashboard role-gating bootstrap / manual re-sync.
//
// Ensures the dashboard `audience` custom MULTI_SELECT field exists (options =
// workspace roles) and that each non-admin role has its row-level READ predicate.
// Ongoing role create/update/delete is handled automatically by
// DashboardAudienceRoleSyncListener; this command is the one-time backfill for
// existing workspaces and a manual re-sync fallback. Idempotent.
//
// Run with: npx nx run twenty-server:command workspace:sync-dashboard-audience
//   --dry-run   list the workspaces that would be synced without writing

import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';

@Command({
  name: 'workspace:sync-dashboard-audience',
  description:
    'Bootstrap/re-sync the dashboard audience field + per-role row-level predicates from workspace roles. Idempotent.',
})
export class SyncDashboardAudienceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly dashboardAudienceRoleSyncService: DashboardAudienceRoleSyncService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (options?.dryRun === true) {
      this.logger.log(
        `[DRY RUN] would sync dashboard audience for workspace ${workspaceId}`,
      );

      return;
    }

    this.logger.log(`Syncing dashboard audience for workspace ${workspaceId}`);

    await this.dashboardAudienceRoleSyncService.syncWorkspace(workspaceId);

    this.logger.log(`  Done for workspace ${workspaceId}`);
  }
}
