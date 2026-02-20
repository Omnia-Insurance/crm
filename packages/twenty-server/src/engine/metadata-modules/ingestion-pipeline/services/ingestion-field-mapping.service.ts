import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { type CreateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-field-mapping.input';
import { type IngestionFieldMappingDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-field-mapping.dto';
import { type UpdateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-field-mapping.input';
import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';

@Injectable()
export class IngestionFieldMappingService {
  constructor(
    @InjectRepository(IngestionFieldMappingEntity)
    private readonly mappingRepository: Repository<IngestionFieldMappingEntity>,
  ) {}

  private toDTO(
    entity: IngestionFieldMappingEntity,
  ): IngestionFieldMappingDTO {
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

  async findByPipelineId(
    pipelineId: string,
  ): Promise<IngestionFieldMappingDTO[]> {
    const mappings = await this.mappingRepository.find({
      where: { pipelineId },
      order: { position: 'ASC' },
    });

    return mappings.map((mapping) => this.toDTO(mapping));
  }

  async findEntitiesByPipelineId(
    pipelineId: string,
  ): Promise<IngestionFieldMappingEntity[]> {
    return this.mappingRepository.find({
      where: { pipelineId },
      order: { position: 'ASC' },
    });
  }

  async create(
    input: CreateIngestionFieldMappingInput,
  ): Promise<IngestionFieldMappingDTO> {
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
  ): Promise<IngestionFieldMappingDTO[]> {
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
  ): Promise<IngestionFieldMappingDTO> {
    const existing = await this.mappingRepository.findOne({
      where: { id: input.id },
    });

    if (!isDefined(existing)) {
      throw new IngestionPipelineException(
        `Field mapping ${input.id} not found`,
        IngestionPipelineExceptionCode.FIELD_MAPPING_NOT_FOUND,
      );
    }

    Object.assign(existing, input.update);

    const saved = await this.mappingRepository.save(existing);

    return this.toDTO(saved);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.mappingRepository.delete(id);

    return (result.affected ?? 0) > 0;
  }

  async deleteByPipelineId(pipelineId: string): Promise<void> {
    await this.mappingRepository.delete({ pipelineId });
  }
}
