import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AccessPolicyGuard } from 'src/engine/guards/access-policy.guard';
import { INGESTION_PIPELINE_READ_ACCESS_POLICY } from 'src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-read-access-policy.constant';
import { INGESTION_PIPELINE_WRITE_ACCESS_POLICY } from 'src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-write-access-policy.constant';
import { CreateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-field-mapping.input';
import { IngestionFieldMappingDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-field-mapping.dto';
import { UpdateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-field-mapping.input';
import { IngestionPipelineGraphqlApiExceptionInterceptor } from 'src/engine/metadata-modules/ingestion-pipeline/interceptors/ingestion-pipeline-graphql-api-exception.interceptor';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/permissions/utils/permissions-graphql-api-exception.filter';

@UseInterceptors(IngestionPipelineGraphqlApiExceptionInterceptor)
@MetadataResolver(() => IngestionFieldMappingDTO)
@UseFilters(AuthGraphqlApiExceptionFilter, PermissionsGraphqlApiExceptionFilter)
export class IngestionFieldMappingResolver {
  constructor(
    private readonly fieldMappingService: IngestionFieldMappingService,
  ) {}

  @Query(() => [IngestionFieldMappingDTO])
  @UseGuards(AccessPolicyGuard(INGESTION_PIPELINE_READ_ACCESS_POLICY))
  async ingestionFieldMappings(
    @Args('pipelineId', { type: () => UUIDScalarType }) pipelineId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionFieldMappingDTO[]> {
    return await this.fieldMappingService.findByPipelineId(
      pipelineId,
      workspace.id,
    );
  }

  @Mutation(() => IngestionFieldMappingDTO)
  @UseGuards(AccessPolicyGuard(INGESTION_PIPELINE_WRITE_ACCESS_POLICY))
  async createIngestionFieldMapping(
    @Args('input') input: CreateIngestionFieldMappingInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionFieldMappingDTO> {
    return await this.fieldMappingService.create(input, workspace.id);
  }

  @Mutation(() => [IngestionFieldMappingDTO])
  @UseGuards(AccessPolicyGuard(INGESTION_PIPELINE_WRITE_ACCESS_POLICY))
  async createIngestionFieldMappings(
    @Args('inputs', { type: () => [CreateIngestionFieldMappingInput] })
    inputs: CreateIngestionFieldMappingInput[],
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionFieldMappingDTO[]> {
    return await this.fieldMappingService.createMany(inputs, workspace.id);
  }

  @Mutation(() => IngestionFieldMappingDTO)
  @UseGuards(AccessPolicyGuard(INGESTION_PIPELINE_WRITE_ACCESS_POLICY))
  async updateIngestionFieldMapping(
    @Args('input') input: UpdateIngestionFieldMappingInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<IngestionFieldMappingDTO> {
    return await this.fieldMappingService.update(input, workspace.id);
  }

  @Mutation(() => Boolean)
  @UseGuards(AccessPolicyGuard(INGESTION_PIPELINE_WRITE_ACCESS_POLICY))
  async deleteIngestionFieldMapping(
    @Args('id', { type: () => UUIDScalarType }) id: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<boolean> {
    return await this.fieldMappingService.delete(id, workspace.id);
  }
}
