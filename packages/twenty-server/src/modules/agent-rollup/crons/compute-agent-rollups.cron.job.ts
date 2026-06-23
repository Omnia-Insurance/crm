import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Repository } from 'typeorm';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AgentRollupService } from 'src/modules/agent-rollup/services/agent-rollup.service';

// OMNIA-CUSTOM: recomputes per-agent performance rollups on a schedule so the
// leaderboard dashboard stays fresh. Computes each active workspace inline
// (computeWorkspace is cheap and idempotent, and no-ops on workspaces without
// the agentProfile object); a failure in one workspace doesn't block the rest.
@Injectable()
@Processor(MessageQueue.cronQueue)
export class ComputeAgentRollupsCronJob {
  private readonly logger = new Logger(ComputeAgentRollupsCronJob.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly agentRollupService: AgentRollupService,
  ) {}

  @Process(ComputeAgentRollupsCronJob.name)
  async handle(): Promise<void> {
    const workspaces = await this.workspaceRepository.find({
      where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
      select: ['id'],
      order: { id: 'ASC' },
    });

    if (workspaces.length === 0) {
      return;
    }

    let updated = 0;

    for (const workspace of workspaces) {
      try {
        updated += await this.agentRollupService.computeWorkspace(workspace.id);
      } catch (error) {
        this.logger.error(
          `Agent rollup compute failed for workspace ${workspace.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(
      `Agent rollups recomputed across ${workspaces.length} workspace(s); ${updated} agent record(s) changed`,
    );
  }
}
