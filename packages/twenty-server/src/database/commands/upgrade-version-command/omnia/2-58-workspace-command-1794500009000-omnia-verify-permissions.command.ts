import { Command } from 'nest-commander';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { OmniaPermissionsVerificationService } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service';
import { reportOmniaPermissionsViolationsOrThrow } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/report-omnia-permissions-violations-or-throw.util';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

// Last 2.58 workspace step: a throw records the workspace as failed and the upgrade stops before serving traffic
@RegisteredWorkspaceCommand('2.58.0', 1794500009000)
@Command({
  name: 'upgrade:2-58:omnia-verify-permissions',
  description:
    'Fail the upgrade when row level permission rules, PHI object grants, the reconciliation lockdown or permission-gated commands break the Omnia access contract',
})
export class OmniaVerifyPermissionsUpgradeCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly omniaPermissionsVerificationService: OmniaPermissionsVerificationService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const violations =
      await this.omniaPermissionsVerificationService.verifyWorkspace({
        workspaceId,
      });

    reportOmniaPermissionsViolationsOrThrow({
      logger: this.logger,
      workspaceId,
      violations,
      isDryRun: options.dryRun ?? false,
    });
  }
}
