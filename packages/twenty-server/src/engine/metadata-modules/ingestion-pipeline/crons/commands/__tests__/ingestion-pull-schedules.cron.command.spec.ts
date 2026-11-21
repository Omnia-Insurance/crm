import { Test } from '@nestjs/testing';

import { IngestionPullSchedulesCronCommand } from 'src/engine/metadata-modules/ingestion-pipeline/crons/commands/ingestion-pull-schedules.cron.command';
import { IngestionPullSchedulerService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';

describe('IngestionPullSchedulesCronCommand', () => {
  it('should re-register the cron of every enabled pull pipeline', async () => {
    let hasResyncFinished = false;
    const resyncEnabledPullSchedules = jest.fn(async () => {
      await Promise.resolve();
      hasResyncFinished = true;

      return 2;
    });

    const module = await Test.createTestingModule({
      providers: [
        IngestionPullSchedulesCronCommand,
        {
          provide: IngestionPullSchedulerService,
          useValue: { resyncEnabledPullSchedules },
        },
      ],
    }).compile();

    await module.get(IngestionPullSchedulesCronCommand).run();

    expect(resyncEnabledPullSchedules).toHaveBeenCalledTimes(1);
    expect(hasResyncFinished).toBe(true);
  });
});
