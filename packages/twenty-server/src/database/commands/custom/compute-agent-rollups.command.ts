// OMNIA-CUSTOM: writes per-agent leaderboard metrics (policies, 6-month
// placement rate, billable and off-phone hours) onto agentProfile fields.
// Idempotent; --dry-run writes nothing. The hourly cron runs the same service.

import { Command } from 'nest-commander';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { AgentRollupService } from 'src/modules/agent-rollup/services/agent-rollup.service';

@Command({
  name: 'workspace:compute-agent-rollups',
  description:
    'Compute per-agent performance rollups (policies, placement rate, billable/off-phone hours) onto agentProfile fields. Idempotent.',
})
export class ComputeAgentRollupsCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly agentRollupService: AgentRollupService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (options?.dryRun === true) {
      this.logger.log(
        `[DRY RUN] would compute agent rollups for workspace ${workspaceId}`,
      );

      return;
    }

    this.logger.log(`Computing agent rollups for workspace ${workspaceId}`);

    const updated = await this.agentRollupService.computeWorkspace(workspaceId);

    this.logger.log(
      `  Done — ${updated} agent(s) updated for workspace ${workspaceId}`,
    );
  }
}
