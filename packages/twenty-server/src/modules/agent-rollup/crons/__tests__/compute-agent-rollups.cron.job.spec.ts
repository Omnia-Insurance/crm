import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ComputeAgentRollupsCronJob } from 'src/modules/agent-rollup/crons/compute-agent-rollups.cron.job';
import { ComputeAgentRollupsJob } from 'src/modules/agent-rollup/jobs/compute-agent-rollups.job';

describe('ComputeAgentRollupsCronJob', () => {
  const setUpCronJob = async (workspaceIds: string[]) => {
    const workspaceRepository = {
      find: jest.fn().mockResolvedValue(workspaceIds.map((id) => ({ id }))),
    };
    const messageQueueService = { add: jest.fn().mockResolvedValue('job-id') };

    const module = await Test.createTestingModule({
      providers: [
        ComputeAgentRollupsCronJob,
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: workspaceRepository,
        },
        {
          provide: getQueueToken(MessageQueue.workspaceQueue),
          useValue: messageQueueService,
        },
      ],
    }).compile();

    return {
      cronJob: module.get(ComputeAgentRollupsCronJob),
      workspaceRepository,
      messageQueueService,
    };
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should enqueue one workspace-scoped rollup job per active workspace', async () => {
    const { cronJob, workspaceRepository, messageQueueService } =
      await setUpCronJob(['workspace-1', 'workspace-2']);

    await cronJob.handle();

    expect(workspaceRepository.find).toHaveBeenCalledWith({
      where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
      select: ['id'],
      order: { id: 'ASC' },
    });
    expect(messageQueueService.add).toHaveBeenCalledTimes(2);
    expect(messageQueueService.add).toHaveBeenCalledWith(
      ComputeAgentRollupsJob.name,
      { workspaceId: 'workspace-1' },
      { isWorkspaceJob: true, workspaceId: 'workspace-1' },
    );
    expect(messageQueueService.add).toHaveBeenCalledWith(
      ComputeAgentRollupsJob.name,
      { workspaceId: 'workspace-2' },
      { isWorkspaceJob: true, workspaceId: 'workspace-2' },
    );
  });

  it('should keep enqueuing the other workspaces when one enqueue fails', async () => {
    const { cronJob, messageQueueService } = await setUpCronJob([
      'workspace-1',
      'workspace-2',
    ]);

    messageQueueService.add.mockRejectedValueOnce(new Error('Redis down'));

    await expect(cronJob.handle()).resolves.toBeUndefined();
    expect(messageQueueService.add).toHaveBeenCalledTimes(2);
  });
});
