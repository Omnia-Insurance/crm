import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { v4 as uuidV4 } from 'uuid';
import { isDefined } from 'twenty-shared/utils';
import { IsNull, Repository } from 'typeorm';

import { type CreateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-pipeline.input';
import { type IngestionPipelineDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-pipeline.dto';
import { type UpdateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-pipeline.input';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';

@Injectable()
export class IngestionPipelineService {
  constructor(
    @InjectRepository(IngestionPipelineEntity)
    private readonly pipelineRepository: Repository<IngestionPipelineEntity>,
  ) {}

  private toDTO(entity: IngestionPipelineEntity): IngestionPipelineDTO {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      mode: entity.mode,
      targetObjectNameSingular: entity.targetObjectNameSingular,
      webhookSecret: entity.webhookSecret,
      sourceUrl: entity.sourceUrl,
      sourceHttpMethod: entity.sourceHttpMethod,
      sourceAuthConfig:
        entity.sourceAuthConfig as Record<string, unknown> | null,
      sourceRequestConfig:
        entity.sourceRequestConfig as Record<string, unknown> | null,
      responseRecordsPath: entity.responseRecordsPath,
      schedule: entity.schedule,
      dedupFieldName: entity.dedupFieldName,
      paginationConfig:
        entity.paginationConfig as Record<string, unknown> | null,
      isEnabled: entity.isEnabled,
      workspaceId: entity.workspaceId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  private generateWebhookSecret(): string {
    return uuidV4().replace(/-/g, '') + uuidV4().replace(/-/g, '');
  }

  async findAll(workspaceId: string): Promise<IngestionPipelineDTO[]> {
    const pipelines = await this.pipelineRepository.find({
      where: { workspaceId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    return pipelines.map((pipeline) => this.toDTO(pipeline));
  }

  async findById(
    id: string,
    workspaceId: string,
  ): Promise<IngestionPipelineDTO | null> {
    const pipeline = await this.pipelineRepository.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });

    if (!isDefined(pipeline)) {
      return null;
    }

    return this.toDTO(pipeline);
  }

  async findEntityById(
    id: string,
    workspaceId: string,
  ): Promise<IngestionPipelineEntity | null> {
    return this.pipelineRepository.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });
  }

  async create(
    input: CreateIngestionPipelineInput,
    workspaceId: string,
  ): Promise<IngestionPipelineDTO> {
    const webhookSecret =
      input.mode === 'push' ? this.generateWebhookSecret() : null;

    const pipeline = this.pipelineRepository.create({
      ...input,
      workspaceId,
      webhookSecret,
      isEnabled: input.isEnabled ?? false,
    });

    const saved = await this.pipelineRepository.save(pipeline);

    return this.toDTO(saved);
  }

  async update(
    input: UpdateIngestionPipelineInput,
    workspaceId: string,
  ): Promise<IngestionPipelineDTO> {
    const existing = await this.pipelineRepository.findOne({
      where: { id: input.id, workspaceId, deletedAt: IsNull() },
    });

    if (!isDefined(existing)) {
      throw new IngestionPipelineException(
        `Pipeline ${input.id} not found`,
        IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      );
    }

    Object.assign(existing, input.update);

    const saved = await this.pipelineRepository.save(existing);

    return this.toDTO(saved);
  }

  async delete(
    id: string,
    workspaceId: string,
  ): Promise<IngestionPipelineDTO> {
    const existing = await this.pipelineRepository.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });

    if (!isDefined(existing)) {
      throw new IngestionPipelineException(
        `Pipeline ${id} not found`,
        IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      );
    }

    existing.deletedAt = new Date();

    const saved = await this.pipelineRepository.save(existing);

    return this.toDTO(saved);
  }
}
