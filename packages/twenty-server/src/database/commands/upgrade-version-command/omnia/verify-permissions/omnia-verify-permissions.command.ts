import { Command } from 'nest-commander';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { OmniaPermissionsVerificationService } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service';
import { reportOmniaPermissionsViolationsOrThrow } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/report-omnia-permissions-violations-or-throw.util';

// App installs and syncs rewrite roles and grants after the upgrade has verified them
@Command({
  name: 'workspace:omnia-verify-permissions',
  description:
    'Report Omnia row level permission, PHI grant, reconciliation lockdown and command gate violations, and exit non-zero on any. Run after every app install or sync.',
})
export class OmniaVerifyPermissionsCommand extends ProvisionedWorkspaceCommandRunner {
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
