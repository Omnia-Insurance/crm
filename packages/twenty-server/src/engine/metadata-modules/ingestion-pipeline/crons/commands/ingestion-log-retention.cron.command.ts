import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { INGESTION_LOG_RETENTION_CRON_PATTERN } from 'src/engine/metadata-modules/ingestion-pipeline/crons/constants/ingestion-log-retention-cron-pattern.constant';
import { IngestionLogRetentionCronJob } from 'src/engine/metadata-modules/ingestion-pipeline/crons/jobs/ingestion-log-retention.cron.job';

@Command({
  name: 'cron:ingestion-log:retention',
  description:
    'Starts a daily cron job that clears the pushed records of completed ingestion runs, and every run older than 30 days',
})
export class IngestionLogRetentionCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: IngestionLogRetentionCronJob.name,
      data: undefined,
      options: {
        repeat: {
          pattern: INGESTION_LOG_RETENTION_CRON_PATTERN,
        },
      },
    });
  }
}
