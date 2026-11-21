import { Command } from 'nest-commander';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { ReconciliationObjectLockdownService } from 'src/modules/reconciliation/services/object-lockdown.service';

// Roles created through the settings flow, app roles and the 2.57 grant roles were never locked; W9 checks the result
@RegisteredWorkspaceCommand('2.58.0', 1794500006000)
@Command({
  name: 'upgrade:2-58:omnia-reconciliation-object-lockdown',
  description:
    'Deny every role but the standard admin all access to the reconciliation objects',
})
export class OmniaReconciliationObjectLockdownCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly reconciliationObjectLockdownService: ReconciliationObjectLockdownService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const { objectCount, lockedRoleLabels, changedRoleIds } =
      await this.reconciliationObjectLockdownService.applyToAllNonAdminRoles({
        workspaceId,
        dryRun: options.dryRun,
      });

    if (!isNonEmptyArray(changedRoleIds)) {
      return;
    }

    this.logger.log(
      `${options.dryRun ? '[DRY RUN] ' : ''}Workspace ${workspaceId}: locked ${changedRoleIds.length} of ${lockedRoleLabels.length} non-admin role(s) out of ${objectCount} reconciliation object(s) (${changedRoleIds.join(', ')})`,
    );
  }
}
