import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { IsNull } from 'typeorm';

import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPullJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job';
import { IngestionPullSchedulerService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';

const scheduledPullPipeline = {
  id: 'pipeline-1',
  workspaceId: 'workspace-1',
  mode: 'pull',
  isEnabled: true,
  schedule: '*/5 * * * *',
} as IngestionPipelineEntity;

const unscheduledPullPipeline = {
  id: 'pipeline-2',
  workspaceId: 'workspace-1',
  mode: 'pull',
  isEnabled: true,
  schedule: null,
} as unknown as IngestionPipelineEntity;

const buildSchedulerService = async ({
  pullPipelines = [scheduledPullPipeline],
}: {
  pullPipelines?: IngestionPipelineEntity[];
} = {}) => {
  const pipelineRepository = {
    find: jest.fn().mockResolvedValue(pullPipelines),
  };
  const messageQueueService = {
    addCron: jest.fn().mockResolvedValue(undefined),
    removeCron: jest.fn().mockResolvedValue(undefined),
  };

  const module = await Test.createTestingModule({
    providers: [
      IngestionPullSchedulerService,
      {
        provide: getRepositoryToken(IngestionPipelineEntity),
        useValue: pipelineRepository,
      },
      {
        provide: getQueueToken(MessageQueue.ingestionQueue),
        useValue: messageQueueService,
      },
    ],
  }).compile();

  return {
    schedulerService: module.get(IngestionPullSchedulerService),
    pipelineRepository,
    messageQueueService,
  };
};

describe('IngestionPullSchedulerService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should not re-register crons when the module initializes', async () => {
    const { schedulerService, pipelineRepository, messageQueueService } =
      await buildSchedulerService();

    expect('onModuleInit' in schedulerService).toBe(false);
    expect(pipelineRepository.find).not.toHaveBeenCalled();
    expect(messageQueueService.addCron).not.toHaveBeenCalled();
  });

  describe('resyncEnabledPullSchedules', () => {
    it('should re-register the cron of every enabled scheduled pull pipeline', async () => {
      const { schedulerService, pipelineRepository, messageQueueService } =
        await buildSchedulerService({
          pullPipelines: [scheduledPullPipeline, unscheduledPullPipeline],
        });

      const resyncedCount = await schedulerService.resyncEnabledPullSchedules();

      expect(resyncedCount).toBe(1);
      expect(pipelineRepository.find).toHaveBeenCalledWith({
        where: { mode: 'pull', isEnabled: true, deletedAt: IsNull() },
      });
      expect(messageQueueService.removeCron).toHaveBeenCalledWith({
        jobName: IngestionPullJob.name,
        jobId: 'ingestion-pull-pipeline-1',
      });
      expect(messageQueueService.addCron).toHaveBeenCalledTimes(1);
      expect(messageQueueService.addCron).toHaveBeenCalledWith({
        jobName: IngestionPullJob.name,
        data: { pipelineId: 'pipeline-1', workspaceId: 'workspace-1' },
        options: { repeat: { pattern: '*/5 * * * *' } },
        jobId: 'ingestion-pull-pipeline-1',
      });
    });

    it('should return 0 and leave the crons alone when the pipeline table cannot be read', async () => {
      const { schedulerService, pipelineRepository, messageQueueService } =
        await buildSchedulerService();

      pipelineRepository.find.mockRejectedValue(
        new Error('column "schedule" does not exist'),
      );

      await expect(schedulerService.resyncEnabledPullSchedules()).resolves.toBe(
        0,
      );
      expect(messageQueueService.removeCron).not.toHaveBeenCalled();
      expect(messageQueueService.addCron).not.toHaveBeenCalled();
    });

    it('should return 0 when no pull pipeline is enabled', async () => {
      const { schedulerService, messageQueueService } =
        await buildSchedulerService({ pullPipelines: [] });

      await expect(schedulerService.resyncEnabledPullSchedules()).resolves.toBe(
        0,
      );
      expect(messageQueueService.addCron).not.toHaveBeenCalled();
    });
  });
});
