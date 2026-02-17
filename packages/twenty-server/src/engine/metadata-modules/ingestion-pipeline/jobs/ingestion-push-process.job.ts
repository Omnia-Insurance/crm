import { Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type IngestionPushProcessJobData } from 'src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionRecordProcessorService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service';

@Processor(MessageQueue.ingestionQueue)
export class IngestionPushProcessJob {
  private readonly logger = new Logger(IngestionPushProcessJob.name);

  constructor(
    private readonly pipelineService: IngestionPipelineService,
    private readonly fieldMappingService: IngestionFieldMappingService,
    private readonly logService: IngestionLogService,
    private readonly recordProcessorService: IngestionRecordProcessorService,
  ) {}

  @Process(IngestionPushProcessJob.name)
  async handle(data: IngestionPushProcessJobData): Promise<void> {
    const { pipelineId, workspaceId, logId, records } = data;

    this.logger.log(
      `Processing push ingestion: pipeline=${pipelineId}, log=${logId}, records=${records.length}`,
    );

    await this.logService.markRunning(logId);

    try {
      const pipeline = await this.pipelineService.findEntityById(
        pipelineId,
        workspaceId,
      );

      if (!isDefined(pipeline)) {
        await this.logService.markFailed(logId, 'Pipeline not found');

        return;
      }

      const mappings =
        await this.fieldMappingService.findEntitiesByPipelineId(pipelineId);

      if (mappings.length === 0) {
        await this.logService.markFailed(logId, 'No field mappings configured');

        return;
      }

      const result = await this.recordProcessorService.processRecords(
        records,
        pipeline,
        mappings,
        workspaceId,
      );

      await this.logService.markCompleted(logId, {
        totalRecordsReceived: records.length,
        ...result,
      });

      this.logger.log(
        `Push ingestion completed: pipeline=${pipelineId}, created=${result.recordsCreated}, updated=${result.recordsUpdated}, failed=${result.recordsFailed}`,
      );
    } catch (error) {
      this.logger.error(
        `Push ingestion failed: pipeline=${pipelineId}, error=${error}`,
      );

      await this.logService.markFailed(
        logId,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}
