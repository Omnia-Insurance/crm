import { Command, CommandRunner } from 'nest-commander';

import { IngestionPullSchedulerService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';

@Command({
  name: 'cron:ingestion-pull-schedules',
  description: 'Re-registers the cron of every enabled pull ingestion pipeline',
})
export class IngestionPullSchedulesCronCommand extends CommandRunner {
  constructor(
    private readonly ingestionPullSchedulerService: IngestionPullSchedulerService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.ingestionPullSchedulerService.resyncEnabledPullSchedules();
  }
}
