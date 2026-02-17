import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { type Request } from 'express';

import {
  ThrottlerException,
  ThrottlerExceptionCode,
} from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineWebhookController } from 'src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller';

const workspaceId = 'workspace-1';
const pipelineId = 'pipeline-1';

const mockPipeline: IngestionPipelineEntity = {
  id: pipelineId,
  workspaceId,
  name: 'Test Push Pipeline',
  mode: 'push',
  isEnabled: true,
  webhookSecret: 'valid-secret',
  targetObjectNameSingular: 'person',
} as IngestionPipelineEntity;

const mockRepository = {
  findOne: jest.fn(),
};

const mockThrottlerService = {
  tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(99),
};

describe('IngestionPipelineWebhookController', () => {
  let controller: IngestionPipelineWebhookController;
  let messageQueueService: { add: jest.Mock };

  beforeEach(async () => {
    messageQueueService = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestionPipelineWebhookController],
      providers: [
        {
          provide: getRepositoryToken(IngestionPipelineEntity),
          useValue: mockRepository,
        },
        {
          provide: IngestionLogService,
          useValue: {
            createPending: jest.fn().mockResolvedValue({ id: 'log-1' }),
          },
        },
        {
          provide: ThrottlerService,
          useValue: mockThrottlerService,
        },
        {
          provide: 'MESSAGE_QUEUE_ingestion-queue',
          useValue: messageQueueService,
        },
      ],
    }).compile();

    controller = module.get<IngestionPipelineWebhookController>(
      IngestionPipelineWebhookController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const makeRequest = (
    body: unknown,
    secret?: string,
  ): Pick<Request, 'body' | 'headers' | 'query'> =>
    ({
      body,
      headers: secret ? { 'x-webhook-secret': secret } : {},
      query: {},
    }) as Pick<Request, 'body' | 'headers' | 'query'>;

  describe('handlePush', () => {
    it('should process a valid push request with array body', async () => {
      mockRepository.findOne.mockResolvedValue(mockPipeline);

      const records = [
        { firstName: 'John', phone: '+15551234567' },
        { firstName: 'Jane', phone: '+15559876543' },
      ];

      const result = await controller.handlePush(
        pipelineId,
        makeRequest(records, 'valid-secret') as Request,
      );

      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(2);
      expect(result.logId).toBe('log-1');
      expect(messageQueueService.add).toHaveBeenCalledWith(
        'IngestionPushProcessJob',
        expect.objectContaining({
          pipelineId,
          workspaceId,
          logId: 'log-1',
          records,
        }),
        { retryLimit: 3 },
      );
    });

    it('should wrap single object body in array', async () => {
      mockRepository.findOne.mockResolvedValue(mockPipeline);

      const singleRecord = { firstName: 'John', phone: '+15551234567' };

      const result = await controller.handlePush(
        pipelineId,
        makeRequest(singleRecord, 'valid-secret') as Request,
      );

      expect(result.recordCount).toBe(1);
      expect(messageQueueService.add).toHaveBeenCalledWith(
        'IngestionPushProcessJob',
        expect.objectContaining({
          records: [singleRecord],
        }),
        expect.any(Object),
      );
    });

    it('should throw when pipeline not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.handlePush(
          pipelineId,
          makeRequest([], 'secret') as Request,
        ),
      ).rejects.toThrow(IngestionPipelineException);
    });

    it('should throw when pipeline is disabled', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockPipeline,
        isEnabled: false,
      });

      await expect(
        controller.handlePush(
          pipelineId,
          makeRequest([], 'valid-secret') as Request,
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.PIPELINE_DISABLED,
      });
    });

    it('should throw when pipeline is not push mode', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockPipeline,
        mode: 'pull',
      });

      await expect(
        controller.handlePush(
          pipelineId,
          makeRequest([], 'valid-secret') as Request,
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT,
      });
    });

    it('should throw when webhook secret is invalid', async () => {
      mockRepository.findOne.mockResolvedValue(mockPipeline);

      await expect(
        controller.handlePush(
          pipelineId,
          makeRequest([], 'wrong-secret') as Request,
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET,
      });
    });

    it('should accept request when pipeline has no webhook secret', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockPipeline,
        webhookSecret: null,
      });

      const result = await controller.handlePush(
        pipelineId,
        makeRequest([{ name: 'test' }]) as Request,
      );

      expect(result.success).toBe(true);
    });

    it('should return 429 when rate limit is exceeded', async () => {
      mockRepository.findOne.mockResolvedValue(mockPipeline);
      mockThrottlerService.tokenBucketThrottleOrThrow.mockRejectedValue(
        new ThrottlerException(
          'Limit reached (100 tokens per 60000 ms)',
          ThrottlerExceptionCode.LIMIT_REACHED,
        ),
      );

      await expect(
        controller.handlePush(
          pipelineId,
          makeRequest([{ name: 'test' }], 'valid-secret') as Request,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
        }),
      );
    });

    it('should allow request when under rate limit', async () => {
      mockRepository.findOne.mockResolvedValue(mockPipeline);
      mockThrottlerService.tokenBucketThrottleOrThrow.mockResolvedValue(99);

      const result = await controller.handlePush(
        pipelineId,
        makeRequest([{ name: 'test' }], 'valid-secret') as Request,
      );

      expect(result.success).toBe(true);
      expect(
        mockThrottlerService.tokenBucketThrottleOrThrow,
      ).toHaveBeenCalledWith(
        `ingestion-webhook:${pipelineId}`,
        1,
        100,
        60_000,
      );
    });
  });
});
