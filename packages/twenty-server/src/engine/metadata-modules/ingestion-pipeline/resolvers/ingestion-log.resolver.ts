import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Int, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AccessPolicyGuard } from 'src/engine/guards/access-policy.guard';
import { INGESTION_LOG_READ_ACCESS_POLICY } from 'src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-log-read-access-policy.constant';
import { IngestionLogDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-log.dto';
import { IngestionPipelineGraphqlApiExceptionInterceptor } from 'src/engine/metadata-modules/ingestion-pipeline/interceptors/ingestion-pipeline-graphql-api-exception.interceptor';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/permissions/utils/permissions-graphql-api-exception.filter';

const DEFAULT_INGESTION_LOGS_LIMIT = 50;

const MAX_INGESTION_LOGS_LIMIT = 100;

@UseInterceptors(IngestionPipelineGraphqlApiExceptionInterceptor)
@MetadataResolver(() => IngestionLogDTO)
@UseFilters(AuthGraphqlApiExceptionFilter, PermissionsGraphqlApiExceptionFilter)
export class IngestionLogResolver {
  constructor(private readonly logService: IngestionLogService) {}

  @Query(() => [IngestionLogDTO])
  @UseGuards(AccessPolicyGuard(INGESTION_LOG_READ_ACCESS_POLICY))
  async ingestionLogs(
    @Args('pipelineId', { type: () => UUIDScalarType }) pipelineId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<IngestionLogDTO[]> {
    return await this.logService.findByPipelineId(
      pipelineId,
      workspace.id,
      Math.min(
        Math.max(limit ?? DEFAULT_INGESTION_LOGS_LIMIT, 1),
        MAX_INGESTION_LOGS_LIMIT,
      ),
    );
  }
}
