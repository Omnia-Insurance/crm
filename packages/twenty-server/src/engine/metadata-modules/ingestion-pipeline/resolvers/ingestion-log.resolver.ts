import { UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Int, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { IngestionLogDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-log.dto';
import { IngestionPipelineGraphqlApiExceptionInterceptor } from 'src/engine/metadata-modules/ingestion-pipeline/interceptors/ingestion-pipeline-graphql-api-exception.interceptor';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';

@UseGuards(WorkspaceAuthGuard)
@UseInterceptors(IngestionPipelineGraphqlApiExceptionInterceptor)
@MetadataResolver(() => IngestionLogDTO)
export class IngestionLogResolver {
  constructor(private readonly logService: IngestionLogService) {}

  @Query(() => [IngestionLogDTO])
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async ingestionLogs(
    @Args('pipelineId', { type: () => UUIDScalarType }) pipelineId: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<IngestionLogDTO[]> {
    return await this.logService.findByPipelineId(pipelineId, limit ?? 50);
  }
}
