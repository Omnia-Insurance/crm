import { Command, CommandRunner } from 'nest-commander';

import { IMPORT_JOB_VALIDATED_ROWS_RETENTION_CRON_PATTERN } from 'src/engine/core-modules/import-job/crons/constants/import-job-validated-rows-retention-cron-pattern.constant';
import { ImportJobValidatedRowsRetentionCronJob } from 'src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

@Command({
  name: 'cron:import-job:validated-rows-retention',
  description:
    'Starts a daily cron job that clears the staged rows of import jobs that ended, or stalled, more than 30 days ago',
})
export class ImportJobValidatedRowsRetentionCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: ImportJobValidatedRowsRetentionCronJob.name,
      data: undefined,
      options: {
        repeat: {
          pattern: IMPORT_JOB_VALIDATED_ROWS_RETENTION_CRON_PATTERN,
        },
      },
    });
  }
}
