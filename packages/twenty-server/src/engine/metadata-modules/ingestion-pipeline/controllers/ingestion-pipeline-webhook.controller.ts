import {
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Request } from 'express';
import { isDefined } from 'twenty-shared/utils';

import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { throttlerToRestApiExceptionHandler } from 'src/engine/core-modules/throttler/utils/throttler-to-rest-api-exception-handler.util';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { IngestionPushProcessJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-push-process.job';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

const WEBHOOK_RATE_LIMIT_MAX_TOKENS = 100;
const WEBHOOK_RATE_LIMIT_WINDOW_MS = 60_000;

@Controller('ingestion')
export class IngestionPipelineWebhookController {
  private readonly logger = new Logger(
    IngestionPipelineWebhookController.name,
  );

  constructor(
    @InjectRepository(IngestionPipelineEntity)
    private readonly pipelineRepository: Repository<IngestionPipelineEntity>,
    private readonly logService: IngestionLogService,
    private readonly throttlerService: ThrottlerService,
    @InjectMessageQueue(MessageQueue.ingestionQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @Post(':pipelineId')
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  @HttpCode(200)
  async handlePush(
    @Param('pipelineId') pipelineId: string,
    @Req() request: Request,
  ) {
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId, deletedAt: IsNull() },
    });

    if (!isDefined(pipeline)) {
      throw new IngestionPipelineException(
        `Pipeline ${pipelineId} not found`,
        IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      );
    }

    if (!pipeline.isEnabled) {
      throw new IngestionPipelineException(
        `Pipeline ${pipelineId} is disabled`,
        IngestionPipelineExceptionCode.PIPELINE_DISABLED,
      );
    }

    if (pipeline.mode !== 'push') {
      throw new IngestionPipelineException(
        `Pipeline ${pipelineId} is not a push pipeline`,
        IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT,
      );
    }

    // Validate webhook secret
    const secret =
      request.headers['x-webhook-secret'] || request.query['secret'];

    if (pipeline.webhookSecret && secret !== pipeline.webhookSecret) {
      throw new IngestionPipelineException(
        'Invalid webhook secret',
        IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET,
      );
    }

    // Rate limit per pipeline
    try {
      await this.throttlerService.tokenBucketThrottleOrThrow(
        `ingestion-webhook:${pipelineId}`,
        1,
        WEBHOOK_RATE_LIMIT_MAX_TOKENS,
        WEBHOOK_RATE_LIMIT_WINDOW_MS,
      );
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throttlerToRestApiExceptionHandler(error);
      }
      throw error;
    }

    // Parse body — wrap single objects in array
    let records = request.body;

    if (!Array.isArray(records)) {
      records = [records];
    }

    // Create pending log entry with incoming payload
    const log = await this.logService.createPending(pipelineId, 'push', records);

    // Enqueue for async processing
    await this.messageQueueService.add<IngestionPushProcessJobData>(
      IngestionPushProcessJob.name,
      {
        pipelineId,
        workspaceId: pipeline.workspaceId,
        logId: log.id,
        records,
      },
      { retryLimit: 3 },
    );

    this.logger.log(
      `Queued push ingestion for pipeline ${pipelineId}, log ${log.id}, ${records.length} records`,
    );

    return {
      success: true,
      pipelineId,
      logId: log.id,
      recordCount: records.length,
    };
  }
}

export type IngestionPushProcessJobData = {
  pipelineId: string;
  workspaceId: string;
  logId: string;
  records: Record<string, unknown>[];
};
