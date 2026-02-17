import { UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CreateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-field-mapping.input';
import { IngestionFieldMappingDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-field-mapping.dto';
import { UpdateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-field-mapping.input';
import { IngestionPipelineGraphqlApiExceptionInterceptor } from 'src/engine/metadata-modules/ingestion-pipeline/interceptors/ingestion-pipeline-graphql-api-exception.interceptor';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';

@UseGuards(WorkspaceAuthGuard)
@UseInterceptors(IngestionPipelineGraphqlApiExceptionInterceptor)
@MetadataResolver(() => IngestionFieldMappingDTO)
export class IngestionFieldMappingResolver {
  constructor(
    private readonly fieldMappingService: IngestionFieldMappingService,
  ) {}

  @Query(() => [IngestionFieldMappingDTO])
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async ingestionFieldMappings(
    @Args('pipelineId', { type: () => UUIDScalarType }) pipelineId: string,
  ): Promise<IngestionFieldMappingDTO[]> {
    return await this.fieldMappingService.findByPipelineId(pipelineId);
  }

  @Mutation(() => IngestionFieldMappingDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async createIngestionFieldMapping(
    @Args('input') input: CreateIngestionFieldMappingInput,
  ): Promise<IngestionFieldMappingDTO> {
    return await this.fieldMappingService.create(input);
  }

  @Mutation(() => [IngestionFieldMappingDTO])
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async createIngestionFieldMappings(
    @Args('inputs', { type: () => [CreateIngestionFieldMappingInput] })
    inputs: CreateIngestionFieldMappingInput[],
  ): Promise<IngestionFieldMappingDTO[]> {
    return await this.fieldMappingService.createMany(inputs);
  }

  @Mutation(() => IngestionFieldMappingDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async updateIngestionFieldMapping(
    @Args('input') input: UpdateIngestionFieldMappingInput,
  ): Promise<IngestionFieldMappingDTO> {
    return await this.fieldMappingService.update(input);
  }

  @Mutation(() => Boolean)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async deleteIngestionFieldMapping(
    @Args('id', { type: () => UUIDScalarType }) id: string,
  ): Promise<boolean> {
    return await this.fieldMappingService.delete(id);
  }
}
