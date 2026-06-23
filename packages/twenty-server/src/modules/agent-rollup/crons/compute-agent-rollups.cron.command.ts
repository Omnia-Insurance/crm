import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { COMPUTE_AGENT_ROLLUPS_CRON_PATTERN } from 'src/modules/agent-rollup/constants/agent-rollup-cron-pattern.constant';
import { ComputeAgentRollupsCronJob } from 'src/modules/agent-rollup/crons/compute-agent-rollups.cron.job';

// OMNIA-CUSTOM: registers the recurring agent-rollup recompute. Picked up by
// `cron:register:all` (run on deploy) or runnable directly via
// `cron:compute-agent-rollups`. Idempotent — re-registering updates the
// repeatable job in place.
@Command({
  name: 'cron:compute-agent-rollups',
  description:
    'Starts a cron job to recompute per-agent performance rollups for the leaderboard dashboard',
})
export class ComputeAgentRollupsCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: ComputeAgentRollupsCronJob.name,
      data: undefined,
      options: {
        repeat: {
          pattern: COMPUTE_AGENT_ROLLUPS_CRON_PATTERN,
        },
      },
    });
  }
}
