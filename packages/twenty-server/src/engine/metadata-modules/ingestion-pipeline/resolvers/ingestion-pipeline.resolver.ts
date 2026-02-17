import { UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CreateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-pipeline.input';
import { IngestionPipelineDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-pipeline.dto';
import { UpdateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-pipeline.input';
import { TestIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/test-ingestion-pipeline.input';
import { TestIngestionPipelineResultDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/test-ingestion-pipeline-result.dto';
import { IngestionLogDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-log.dto';
import { IngestionPipelineGraphqlApiExceptionInterceptor } from 'src/engine/metadata-modules/ingestion-pipeline/interceptors/ingestion-pipeline-graphql-api-exception.interceptor';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionPullSchedulerService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { IngestionPullJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job';
import { type IngestionPullJobData } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { buildRecordFromMappings } from 'src/engine/metadata-modules/ingestion-pipeline/utils/build-record-from-mappings.util';

@UseGuards(WorkspaceAuthGuard)
@UseInterceptors(IngestionPipelineGraphqlApiExceptionInterceptor)
@MetadataResolver(() => IngestionPipelineDTO)
export class IngestionPipelineResolver {
  constructor(
    private readonly ingestionPipelineService: IngestionPipelineService,
    private readonly fieldMappingService: IngestionFieldMappingService,
    private readonly logService: IngestionLogService,
    private readonly pullSchedulerService: IngestionPullSchedulerService,
    @InjectMessageQueue(MessageQueue.ingestionQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @Query(() => [IngestionPipelineDTO])
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async ingestionPipelines(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionPipelineDTO[]> {
    return await this.ingestionPipelineService.findAll(workspace.id);
  }

  @Query(() => IngestionPipelineDTO, { nullable: true })
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async ingestionPipeline(
    @Args('id', { type: () => UUIDScalarType }) id: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionPipelineDTO | null> {
    return await this.ingestionPipelineService.findById(id, workspace.id);
  }

  @Mutation(() => IngestionPipelineDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async createIngestionPipeline(
    @Args('input') input: CreateIngestionPipelineInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionPipelineDTO> {
    const dto = await this.ingestionPipelineService.create(
      input,
      workspace.id,
    );

    // Sync cron schedule for pull pipelines
    const entity = await this.ingestionPipelineService.findEntityById(
      dto.id,
      workspace.id,
    );

    if (entity) {
      await this.pullSchedulerService.syncSchedule(entity);
    }

    return dto;
  }

  @Mutation(() => IngestionPipelineDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async updateIngestionPipeline(
    @Args('input') input: UpdateIngestionPipelineInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionPipelineDTO> {
    const dto = await this.ingestionPipelineService.update(
      input,
      workspace.id,
    );

    // Re-sync cron schedule (handles enable/disable, schedule changes)
    const entity = await this.ingestionPipelineService.findEntityById(
      dto.id,
      workspace.id,
    );

    if (entity) {
      await this.pullSchedulerService.syncSchedule(entity);
    }

    return dto;
  }

  @Mutation(() => IngestionPipelineDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async deleteIngestionPipeline(
    @Args('id', { type: () => UUIDScalarType }) id: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionPipelineDTO> {
    // Remove cron schedule before soft-deleting
    const entity = await this.ingestionPipelineService.findEntityById(
      id,
      workspace.id,
    );

    if (entity) {
      // Set isEnabled=false so syncSchedule removes the cron job
      entity.isEnabled = false;
      await this.pullSchedulerService.syncSchedule(entity);
    }

    return await this.ingestionPipelineService.delete(id, workspace.id);
  }

  @Mutation(() => IngestionLogDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async triggerIngestionPull(
    @Args('pipelineId', { type: () => UUIDScalarType }) pipelineId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionLogDTO> {
    const pipeline = await this.ingestionPipelineService.findEntityById(
      pipelineId,
      workspace.id,
    );

    if (!pipeline) {
      throw new IngestionPipelineException(
        `Pipeline ${pipelineId} not found`,
        IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      );
    }

    const log = await this.logService.createPending(pipelineId, 'pull');

    await this.messageQueueService.add<IngestionPullJobData>(
      IngestionPullJob.name,
      {
        pipelineId,
        workspaceId: workspace.id,
      },
      { retryLimit: 3 },
    );

    return {
      id: log.id,
      pipelineId: log.pipelineId,
      status: log.status,
      triggerType: log.triggerType,
      totalRecordsReceived: log.totalRecordsReceived,
      recordsCreated: log.recordsCreated,
      recordsUpdated: log.recordsUpdated,
      recordsSkipped: log.recordsSkipped,
      recordsFailed: log.recordsFailed,
      errors: null,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      durationMs: log.durationMs,
    };
  }

  @Mutation(() => TestIngestionPipelineResultDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async testIngestionPipeline(
    @Args('input') input: TestIngestionPipelineInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TestIngestionPipelineResultDTO> {
    const pipeline = await this.ingestionPipelineService.findEntityById(
      input.pipelineId,
      workspace.id,
    );

    if (!pipeline) {
      throw new IngestionPipelineException(
        `Pipeline ${input.pipelineId} not found`,
        IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      );
    }

    const mappings = await this.fieldMappingService.findEntitiesByPipelineId(
      input.pipelineId,
    );

    const previewRecords: Record<string, unknown>[] = [];
    const errors: Record<string, unknown>[] = [];
    let validRecords = 0;
    let invalidRecords = 0;

    for (let i = 0; i < input.sampleRecords.length; i++) {
      try {
        const mapped = buildRecordFromMappings(
          input.sampleRecords[i],
          mappings,
        );

        previewRecords.push(mapped);
        validRecords++;
      } catch (error) {
        invalidRecords++;
        errors.push({
          recordIndex: i,
          message:
            error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      success: invalidRecords === 0,
      totalRecords: input.sampleRecords.length,
      validRecords,
      invalidRecords,
      previewRecords: previewRecords.length > 0 ? previewRecords : null,
      errors: errors.length > 0 ? errors : null,
    };
  }
}
