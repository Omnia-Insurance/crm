import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Repository } from 'typeorm';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  ComputeAgentRollupsJob,
  type ComputeAgentRollupsJobData,
} from 'src/modules/agent-rollup/jobs/compute-agent-rollups.job';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class ComputeAgentRollupsCronJob {
  private readonly logger = new Logger(ComputeAgentRollupsCronJob.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @Process(ComputeAgentRollupsCronJob.name)
  async handle(): Promise<void> {
    const workspaces = await this.workspaceRepository.find({
      where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
      select: ['id'],
      order: { id: 'ASC' },
    });

    let enqueuedCount = 0;

    for (const workspace of workspaces) {
      try {
        await this.messageQueueService.add<ComputeAgentRollupsJobData>(
          ComputeAgentRollupsJob.name,
          { workspaceId: workspace.id },
          { isWorkspaceJob: true, workspaceId: workspace.id },
        );
        enqueuedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to enqueue agent rollups for workspace ${workspace.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Enqueued agent rollups for ${enqueuedCount} of ${workspaces.length} active workspace(s)`,
    );
  }
}
