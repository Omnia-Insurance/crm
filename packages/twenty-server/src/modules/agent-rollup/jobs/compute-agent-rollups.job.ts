import { Injectable, Logger } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { AgentRollupService } from 'src/modules/agent-rollup/services/agent-rollup.service';

export type ComputeAgentRollupsJobData = {
  workspaceId: string;
};

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class ComputeAgentRollupsJob {
  private readonly logger = new Logger(ComputeAgentRollupsJob.name);

  constructor(private readonly agentRollupService: AgentRollupService) {}

  @Process(ComputeAgentRollupsJob.name)
  async handle({ workspaceId }: ComputeAgentRollupsJobData): Promise<void> {
    const updatedAgentCount =
      await this.agentRollupService.computeWorkspace(workspaceId);

    this.logger.log(
      `Agent rollups recomputed for workspace ${workspaceId}: ${updatedAgentCount} agent(s) changed`,
    );
  }
}
