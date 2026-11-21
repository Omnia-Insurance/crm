import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { type FindOptionsWhere, IsNull, Repository } from 'typeorm';

import { type CreateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-field-mapping.input';
import { type IngestionFieldMappingDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-field-mapping.dto';
import { type UpdateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-field-mapping.input';
import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';

@Injectable()
export class IngestionFieldMappingService {
  constructor(
    // No workspaceId column: every query is scoped through the owning pipeline
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(IngestionFieldMappingEntity)
    private readonly mappingRepository: Repository<IngestionFieldMappingEntity>,
    private readonly ingestionPipelineService: IngestionPipelineService,
  ) {}

  private toDTO(entity: IngestionFieldMappingEntity): IngestionFieldMappingDTO {
    return {
      id: entity.id,
      pipelineId: entity.pipelineId,
      sourceFieldPath: entity.sourceFieldPath,
      targetFieldName: entity.targetFieldName,
      targetCompositeSubField: entity.targetCompositeSubField,
      transform: entity.transform as Record<string, unknown> | null,
      relationTargetObjectName: entity.relationTargetObjectName,
      relationMatchFieldName: entity.relationMatchFieldName,
      relationAutoCreate: entity.relationAutoCreate,
      position: entity.position,
    };
  }

  private buildWorkspaceScopedWhere(
    workspaceId: string,
    where: FindOptionsWhere<IngestionFieldMappingEntity>,
  ): FindOptionsWhere<IngestionFieldMappingEntity> {
    return {
      ...where,
      pipeline: { workspaceId, deletedAt: IsNull() },
    };
  }

  async findByPipelineId(
    pipelineId: string,
    workspaceId: string,
  ): Promise<IngestionFieldMappingDTO[]> {
    const mappings = await this.findEntitiesByPipelineId(
      pipelineId,
      workspaceId,
    );

    return mappings.map((mapping) => this.toDTO(mapping));
  }

  async findEntitiesByPipelineId(
    pipelineId: string,
    workspaceId: string,
  ): Promise<IngestionFieldMappingEntity[]> {
    return this.mappingRepository.find({
      where: this.buildWorkspaceScopedWhere(workspaceId, { pipelineId }),
      order: { position: 'ASC' },
    });
  }

  async create(
    input: CreateIngestionFieldMappingInput,
    workspaceId: string,
  ): Promise<IngestionFieldMappingDTO> {
    await this.ingestionPipelineService.findEntityByIdOrThrow(
      input.pipelineId,
      workspaceId,
    );

    const mapping = this.mappingRepository.create({
      ...input,
      relationAutoCreate: input.relationAutoCreate ?? false,
      position: input.position ?? 0,
    });

    const saved = await this.mappingRepository.save(mapping);

    return this.toDTO(saved);
  }

  async createMany(
    inputs: CreateIngestionFieldMappingInput[],
    workspaceId: string,
  ): Promise<IngestionFieldMappingDTO[]> {
    for (const pipelineId of new Set(inputs.map((input) => input.pipelineId))) {
      await this.ingestionPipelineService.findEntityByIdOrThrow(
        pipelineId,
        workspaceId,
      );
    }

    const mappings = inputs.map((input) =>
      this.mappingRepository.create({
        ...input,
        relationAutoCreate: input.relationAutoCreate ?? false,
        position: input.position ?? 0,
      }),
    );

    const saved = await this.mappingRepository.save(mappings);

    return saved.map((mapping) => this.toDTO(mapping));
  }

  async update(
    input: UpdateIngestionFieldMappingInput,
    workspaceId: string,
  ): Promise<IngestionFieldMappingDTO> {
    const existing = await this.findEntityByIdOrThrow(input.id, workspaceId);

    Object.assign(existing, input.update);

    const saved = await this.mappingRepository.save(existing);

    return this.toDTO(saved);
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    const existing = await this.mappingRepository.findOne({
      where: this.buildWorkspaceScopedWhere(workspaceId, { id }),
    });

    if (!isDefined(existing)) {
      return false;
    }

    const result = await this.mappingRepository.delete({ id: existing.id });

    return (result.affected ?? 0) > 0;
  }

  private async findEntityByIdOrThrow(
    id: string,
    workspaceId: string,
  ): Promise<IngestionFieldMappingEntity> {
    const mapping = await this.mappingRepository.findOne({
      where: this.buildWorkspaceScopedWhere(workspaceId, { id }),
    });

    if (!isDefined(mapping)) {
      throw new IngestionPipelineException(
        `Field mapping ${id} not found`,
        IngestionPipelineExceptionCode.FIELD_MAPPING_NOT_FOUND,
      );
    }

    return mapping;
  }
}
