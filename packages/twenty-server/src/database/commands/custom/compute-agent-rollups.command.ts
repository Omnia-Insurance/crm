// OMNIA-CUSTOM: Agent performance rollups.
//
// Computes per-agent metrics (total policies, 6-month placement rate, billable
// hours, off-phone idle hours) and writes them onto agentProfile fields so they
// can be displayed/ranked natively in a leaderboard dashboard. Idempotent
// (ensures the fields exist, then recomputes and overwrites).
//
// Run with: npx nx run twenty-server:command workspace:compute-agent-rollups
//   --dry-run   list the workspaces that would be computed without writing

import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { AgentRollupService } from 'src/modules/agent-rollup/services/agent-rollup.service';

@Command({
  name: 'workspace:compute-agent-rollups',
  description:
    'Compute per-agent performance rollups (policies, placement rate, billable/off-phone hours) onto agentProfile fields. Idempotent.',
})
export class ComputeAgentRollupsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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
