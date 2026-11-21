import { Command } from 'nest-commander';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { withDerivedFieldMetadataMaps } from 'src/engine/metadata-modules/flat-entity/utils/with-derived-field-metadata-maps.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';

// Runs after the scoped-permission translation rewrote the audience predicates as rules with raw SQL, and
// before the permission verification that fails the upgrade on a rule granting nothing
@RegisteredWorkspaceCommand('2.58.0', 1794500005000)
@Command({
  name: 'upgrade:2-58:omnia-sync-dashboard-audience',
  description:
    'Give every gated role one dashboard audience rule carrying its dashboard grants, deny its dashboard object permission, and drop rules that grant nothing',
})
export class OmniaSyncDashboardAudienceCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly dashboardAudienceRoleSyncService: DashboardAudienceRoleSyncService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    // Plan from what the database holds, not from caches computed before the upgrade rewrote permissions
    await this.workspaceCacheService.invalidateAndRecompute(
      workspaceId,
      withDerivedFieldMetadataMaps([
        'flatRoleMaps',
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
        'flatObjectPermissionMaps',
        'flatRowLevelPermissionRuleMaps',
        'flatRowLevelPermissionPredicateMaps',
        'flatRowLevelPermissionPredicateGroupMaps',
        'rolesPermissions',
      ]),
    );

    await this.dashboardAudienceRoleSyncService.syncWorkspace(workspaceId, {
      dryRun: options.dryRun,
    });
  }
}
