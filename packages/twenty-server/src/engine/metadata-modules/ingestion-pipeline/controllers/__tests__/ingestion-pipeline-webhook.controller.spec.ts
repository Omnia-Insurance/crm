import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { type Request } from 'express';

import { HttpExceptionHandlerService } from 'src/engine/core-modules/exception-handler/http-exception-handler.service';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import {
  ThrottlerException,
  ThrottlerExceptionCode,
} from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { IngestionPipelineWebhookController } from 'src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPipelineExceptionCode } from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const pipelineId = '8a3f5c1e-2b4d-4e6f-9a1b-3c5d7e9f1a2b';
const webhookSecret = 'a'.repeat(64);

const mockPipeline = {
  id: pipelineId,
  workspaceId,
  name: 'Test Push Pipeline',
  mode: 'push',
  isEnabled: true,
  webhookSecret,
  targetObjectNameSingular: 'person',
} as IngestionPipelineEntity;

const buildRequest = ({
  body,
  headers = {},
  query = {},
}: {
  body: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}) => ({ body, headers, query }) as unknown as Request;

describe('IngestionPipelineWebhookController', () => {
  let controller: IngestionPipelineWebhookController;
  let pipelineRepository: { findOne: jest.Mock };
  let logService: { createPending: jest.Mock };
  let throttlerService: { tokenBucketThrottleOrThrow: jest.Mock };
  let messageQueueService: { add: jest.Mock };

  beforeEach(async () => {
    pipelineRepository = { findOne: jest.fn().mockResolvedValue(mockPipeline) };
    logService = {
      createPending: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };
    throttlerService = {
      tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(99),
    };
    messageQueueService = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestionPipelineWebhookController],
      providers: [
        {
          provide: getRepositoryToken(IngestionPipelineEntity),
          useValue: pipelineRepository,
        },
        { provide: IngestionLogService, useValue: logService },
        { provide: ThrottlerService, useValue: throttlerService },
        {
          provide: getQueueToken(MessageQueue.ingestionQueue),
          useValue: messageQueueService,
        },
        {
          provide: HttpExceptionHandlerService,
          useValue: { handleError: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<IngestionPipelineWebhookController>(
      IngestionPipelineWebhookController,
    );
  });

  describe('webhook secret', () => {
    it('should accept the secret sent in the x-webhook-secret header', async () => {
      const result = await controller.handlePush(
        pipelineId,
        buildRequest({
          body: [{ name: 'test' }],
          headers: { 'x-webhook-secret': webhookSecret },
        }),
      );

      expect(result.success).toBe(true);
    });

    it('should reject a request without the header', async () => {
      await expect(
        controller.handlePush(
          pipelineId,
          buildRequest({ body: [{ name: 'test' }] }),
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET,
      });
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('should reject a wrong secret', async () => {
      await expect(
        controller.handlePush(
          pipelineId,
          buildRequest({
            body: [{ name: 'test' }],
            headers: { 'x-webhook-secret': 'b'.repeat(64) },
          }),
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET,
      });
    });

    it('should reject a secret of a different length', async () => {
      await expect(
        controller.handlePush(
          pipelineId,
          buildRequest({
            body: [{ name: 'test' }],
            headers: { 'x-webhook-secret': webhookSecret.slice(1) },
          }),
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET,
      });
    });

    it('should reject the secret sent as a query parameter', async () => {
      await expect(
        controller.handlePush(
          pipelineId,
          buildRequest({
            body: [{ name: 'test' }],
            query: { secret: webhookSecret },
          }),
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET,
      });
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('should reject every push to a pipeline without a secret', async () => {
      pipelineRepository.findOne.mockResolvedValue({
        ...mockPipeline,
        webhookSecret: null,
      });

      await expect(
        controller.handlePush(
          pipelineId,
          buildRequest({
            body: [{ name: 'test' }],
            headers: { 'x-webhook-secret': '' },
          }),
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET,
      });
    });

    it('should check the secret before revealing the pipeline state', async () => {
      pipelineRepository.findOne.mockResolvedValue({
        ...mockPipeline,
        isEnabled: false,
      });

      await expect(
        controller.handlePush(
          pipelineId,
          buildRequest({ body: [{ name: 'test' }] }),
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET,
      });
    });
  });

  describe('handlePush', () => {
    const authenticatedRequest = (body: unknown) =>
      buildRequest({ body, headers: { 'x-webhook-secret': webhookSecret } });

    it('should enqueue the records as a workspace job on the ingestion queue', async () => {
      const records = [
        { firstName: 'John', phone: '+15551234567' },
        { firstName: 'Jane', phone: '+15559876543' },
      ];

      const result = await controller.handlePush(
        pipelineId,
        authenticatedRequest(records),
      );

      expect(result).toEqual({
        success: true,
        pipelineId,
        logId: 'log-1',
        recordCount: 2,
      });
      expect(logService.createPending).toHaveBeenCalledWith(
        pipelineId,
        'push',
        records,
      );
      expect(messageQueueService.add).toHaveBeenCalledWith(
        'IngestionPushProcessJob',
        { pipelineId, workspaceId, logId: 'log-1', records },
        { isWorkspaceJob: true, workspaceId, retryLimit: 3 },
      );
    });

    it('should wrap single object body in array', async () => {
      const singleRecord = { firstName: 'John', phone: '+15551234567' };

      const result = await controller.handlePush(
        pipelineId,
        authenticatedRequest(singleRecord),
      );

      expect(result.recordCount).toBe(1);
      expect(messageQueueService.add).toHaveBeenCalledWith(
        'IngestionPushProcessJob',
        expect.objectContaining({ records: [singleRecord] }),
        expect.any(Object),
      );
    });

    it('should not query the database for an id that is not a UUID', async () => {
      await expect(
        controller.handlePush('not-a-uuid', authenticatedRequest([])),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      });
      expect(pipelineRepository.findOne).not.toHaveBeenCalled();
    });

    it('should throw when pipeline not found', async () => {
      pipelineRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.handlePush(pipelineId, authenticatedRequest([])),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      });
    });

    it('should throw when pipeline is disabled', async () => {
      pipelineRepository.findOne.mockResolvedValue({
        ...mockPipeline,
        isEnabled: false,
      });

      await expect(
        controller.handlePush(pipelineId, authenticatedRequest([])),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.PIPELINE_DISABLED,
      });
    });

    it('should throw when pipeline is not push mode', async () => {
      pipelineRepository.findOne.mockResolvedValue({
        ...mockPipeline,
        mode: 'pull',
      });

      await expect(
        controller.handlePush(pipelineId, authenticatedRequest([])),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT,
      });
    });

    it('should return 429 when rate limit is exceeded', async () => {
      throttlerService.tokenBucketThrottleOrThrow.mockRejectedValue(
        new ThrottlerException(
          'Limit reached (100 tokens per 60000 ms)',
          ThrottlerExceptionCode.LIMIT_REACHED,
        ),
      );

      await expect(
        controller.handlePush(pipelineId, authenticatedRequest([{ a: 1 }])),
      ).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS }),
      );
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('should throttle per pipeline', async () => {
      await controller.handlePush(pipelineId, authenticatedRequest([{ a: 1 }]));

      expect(throttlerService.tokenBucketThrottleOrThrow).toHaveBeenCalledWith(
        `ingestion-webhook:${pipelineId}`,
        1,
        100,
        60_000,
      );
    });
  });
});
