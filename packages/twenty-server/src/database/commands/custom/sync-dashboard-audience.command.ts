// OMNIA-CUSTOM: manual re-sync of dashboard role-gating (audience field + each
// gated role's audience rule). Role changes sync automatically through
// DashboardAudienceRoleSyncListener. Idempotent; --dry-run only logs the plan.

import { Command } from 'nest-commander';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';

@Command({
  name: 'workspace:sync-dashboard-audience',
  description:
    "Re-sync the dashboard audience field and each gated role's audience rule from workspace roles. Idempotent.",
})
export class SyncDashboardAudienceCommand extends ProvisionedWorkspaceCommandRunner {
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
    await this.dashboardAudienceRoleSyncService.syncWorkspace(workspaceId, {
      dryRun: options.dryRun === true,
    });
  }
}
