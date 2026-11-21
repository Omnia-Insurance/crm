import {
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type Request } from 'express';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { IsNull, Repository } from 'typeorm';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { throttlerToRestApiExceptionHandler } from 'src/engine/core-modules/throttler/utils/throttler-to-rest-api-exception-handler.util';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { INGESTION_WEBHOOK_SECRET_HEADER } from 'src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-webhook-secret-header.constant';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPipelineRestApiExceptionFilter } from 'src/engine/metadata-modules/ingestion-pipeline/filters/ingestion-pipeline-rest-api-exception.filter';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionPushProcessJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-push-process.job';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { isValidIngestionWebhookSecret } from 'src/engine/metadata-modules/ingestion-pipeline/utils/is-valid-ingestion-webhook-secret.util';

const WEBHOOK_RATE_LIMIT_MAX_TOKENS = 100;
const WEBHOOK_RATE_LIMIT_WINDOW_MS = 60_000;

@Controller('ingestion')
@UseFilters(IngestionPipelineRestApiExceptionFilter)
export class IngestionPipelineWebhookController {
  private readonly logger = new Logger(IngestionPipelineWebhookController.name);

  constructor(
    // The workspace is only known once the pipeline is loaded from the URL id
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
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
    const pipeline = isValidUuid(pipelineId)
      ? await this.pipelineRepository.findOne({
          where: { id: pipelineId, deletedAt: IsNull() },
        })
      : null;

    if (!isDefined(pipeline)) {
      throw new IngestionPipelineException(
        `Pipeline ${pipelineId} not found`,
        IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      );
    }

    // Checked before the pipeline state so unauthenticated callers learn nothing about it
    if (
      !isValidIngestionWebhookSecret({
        providedSecret: request.headers[INGESTION_WEBHOOK_SECRET_HEADER],
        expectedSecret: pipeline.webhookSecret,
      })
    ) {
      throw new IngestionPipelineException(
        'Invalid webhook secret',
        IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET,
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

    const records: Record<string, unknown>[] = Array.isArray(request.body)
      ? request.body
      : [request.body];

    const log = await this.logService.createPending(
      pipelineId,
      'push',
      records,
    );

    await this.messageQueueService.add<IngestionPushProcessJobData>(
      IngestionPushProcessJob.name,
      {
        pipelineId,
        workspaceId: pipeline.workspaceId,
        logId: log.id,
        records,
      },
      {
        isWorkspaceJob: true,
        workspaceId: pipeline.workspaceId,
        retryLimit: 3,
      },
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
