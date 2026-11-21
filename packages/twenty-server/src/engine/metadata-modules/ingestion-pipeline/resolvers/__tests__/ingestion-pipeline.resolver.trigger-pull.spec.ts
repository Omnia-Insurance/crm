import { Test, type TestingModule } from '@nestjs/testing';

import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AccessPolicyService } from 'src/engine/guards/access-policy/access-policy.service';
import { type IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionPipelineResolver } from 'src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-pipeline.resolver';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionPullSchedulerService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';

const workspaceId = 'workspace-1';
const pipelineId = 'pipeline-1';

const workspace = { id: workspaceId } as WorkspaceEntity;

const pendingLog = {
  id: 'log-1',
  pipelineId,
  status: 'pending',
  triggerType: 'pull',
  totalRecordsReceived: 0,
  recordsCreated: 0,
  recordsUpdated: 0,
  recordsSkipped: 0,
  recordsFailed: 0,
  incomingPayload: null,
  startedAt: new Date('2026-11-18T10:00:00Z'),
  completedAt: null,
  durationMs: null,
};

describe('IngestionPipelineResolver - triggerIngestionPull', () => {
  let resolver: IngestionPipelineResolver;
  let pipelineService: { findEntityByIdOrThrow: jest.Mock };
  let logService: { createPending: jest.Mock };
  let messageQueueService: { add: jest.Mock };

  beforeEach(async () => {
    pipelineService = {
      findEntityByIdOrThrow: jest
        .fn()
        .mockResolvedValue({ id: pipelineId } as IngestionPipelineEntity),
    };
    logService = { createPending: jest.fn().mockResolvedValue(pendingLog) };
    messageQueueService = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionPipelineResolver,
        { provide: IngestionPipelineService, useValue: pipelineService },
        { provide: IngestionFieldMappingService, useValue: {} },
        { provide: IngestionLogService, useValue: logService },
        {
          provide: IngestionPullSchedulerService,
          useValue: { syncSchedule: jest.fn() },
        },
        {
          provide: getQueueToken(MessageQueue.ingestionQueue),
          useValue: messageQueueService,
        },
        { provide: AccessPolicyService, useValue: {} },
      ],
    }).compile();

    resolver = module.get<IngestionPipelineResolver>(IngestionPipelineResolver);
  });

  it('should enqueue a manual pull as a workspace job that reuses the returned log', async () => {
    const result = await resolver.triggerIngestionPull(
      pipelineId,
      workspace,
      '2026-11-01T00:00:00',
      '2026-11-02T00:00:00',
    );

    expect(pipelineService.findEntityByIdOrThrow).toHaveBeenCalledWith(
      pipelineId,
      workspaceId,
    );
    expect(logService.createPending).toHaveBeenCalledTimes(1);
    expect(messageQueueService.add).toHaveBeenCalledWith(
      'IngestionPullJob',
      {
        pipelineId,
        workspaceId,
        manual: true,
        startTimeOverride: '2026-11-01T00:00:00',
        endTimeOverride: '2026-11-02T00:00:00',
        logId: 'log-1',
      },
      { isWorkspaceJob: true, workspaceId, retryLimit: 3 },
    );
    expect(result).toMatchObject({ id: 'log-1', status: 'pending' });
  });

  it('should not enqueue a pull for a pipeline outside the workspace', async () => {
    pipelineService.findEntityByIdOrThrow.mockRejectedValue(
      new IngestionPipelineException(
        `Pipeline ${pipelineId} not found`,
        IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      ),
    );

    await expect(
      resolver.triggerIngestionPull(pipelineId, workspace),
    ).rejects.toMatchObject({
      code: IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
    });
    expect(logService.createPending).not.toHaveBeenCalled();
    expect(messageQueueService.add).not.toHaveBeenCalled();
  });
});
