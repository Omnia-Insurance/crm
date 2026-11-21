import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isString, isUndefined } from '@sniptt/guards';
import { v4 as uuidV4 } from 'uuid';
import { isDefined } from 'twenty-shared/utils';
import { IsNull } from 'typeorm';

import { type CreateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-pipeline.input';
import { type IngestionPipelineDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-pipeline.dto';
import { type UpdateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-pipeline.input';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { isAllowedIngestionPipelineAuthEnvVar } from 'src/engine/metadata-modules/ingestion-pipeline/utils/is-allowed-ingestion-pipeline-auth-env-var.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

@Injectable()
export class IngestionPipelineService {
  constructor(
    @InjectWorkspaceScopedRepository(IngestionPipelineEntity)
    private readonly pipelineRepository: WorkspaceScopedRepository<IngestionPipelineEntity>,
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
      sourceAuthConfig: entity.sourceAuthConfig as Record<
        string,
        unknown
      > | null,
      sourceRequestConfig: entity.sourceRequestConfig as Record<
        string,
        unknown
      > | null,
      responseRecordsPath: entity.responseRecordsPath,
      schedule: entity.schedule,
      dedupFieldNames: entity.dedupFieldNames,
      paginationConfig: entity.paginationConfig as Record<
        string,
        unknown
      > | null,
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

  // The pull job sends a server env var only to the hosts allowed for it; fail here instead
  private assertSourceAuthEnvVarIsAllowed({
    sourceAuthConfig,
    sourceUrl,
  }: {
    sourceAuthConfig: Record<string, unknown> | null | undefined;
    sourceUrl: string | null | undefined;
  }): void {
    const envVarName = sourceAuthConfig?.envVar;

    if (!isDefined(envVarName)) {
      return;
    }

    if (
      !isString(envVarName) ||
      !isAllowedIngestionPipelineAuthEnvVar({
        envVarName,
        sourceUrl: sourceUrl ?? null,
      })
    ) {
      throw new IngestionPipelineException(
        'Source auth env var is not allowed for the source URL',
        IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT,
        {
          userFriendlyMessage: msg`This environment variable cannot be used to authenticate to this source URL.`,
        },
      );
    }
  }

  async findAll(workspaceId: string): Promise<IngestionPipelineDTO[]> {
    const pipelines = await this.pipelineRepository.find(workspaceId, {
      where: { deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    return pipelines.map((pipeline) => this.toDTO(pipeline));
  }

  async findById(
    id: string,
    workspaceId: string,
  ): Promise<IngestionPipelineDTO | null> {
    const pipeline = await this.findEntityById(id, workspaceId);

    if (!isDefined(pipeline)) {
      return null;
    }

    return this.toDTO(pipeline);
  }

  async findEntityById(
    id: string,
    workspaceId: string,
  ): Promise<IngestionPipelineEntity | null> {
    return this.pipelineRepository.findOne(workspaceId, {
      where: { id, deletedAt: IsNull() },
    });
  }

  async findEntityByIdOrThrow(
    id: string,
    workspaceId: string,
  ): Promise<IngestionPipelineEntity> {
    const pipeline = await this.findEntityById(id, workspaceId);

    if (!isDefined(pipeline)) {
      throw new IngestionPipelineException(
        `Pipeline ${id} not found`,
        IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      );
    }

    return pipeline;
  }

  async create(
    input: CreateIngestionPipelineInput,
    workspaceId: string,
  ): Promise<IngestionPipelineDTO> {
    this.assertSourceAuthEnvVarIsAllowed({
      sourceAuthConfig: input.sourceAuthConfig,
      sourceUrl: input.sourceUrl,
    });

    const pipeline = await this.pipelineRepository.insertAndReturnOne(
      workspaceId,
      {
        ...input,
        webhookSecret:
          input.mode === 'push' ? this.generateWebhookSecret() : null,
        isEnabled: input.isEnabled ?? false,
      },
    );

    return this.toDTO(pipeline);
  }

  async update(
    input: UpdateIngestionPipelineInput,
    workspaceId: string,
  ): Promise<IngestionPipelineDTO> {
    const existing = await this.findEntityByIdOrThrow(input.id, workspaceId);
    const { sourceAuthConfig, sourceUrl } = input.update;

    // Only when the source changes, so a legacy pipeline can still be renamed or disabled
    if (!isUndefined(sourceAuthConfig) || !isUndefined(sourceUrl)) {
      this.assertSourceAuthEnvVarIsAllowed({
        sourceAuthConfig: isUndefined(sourceAuthConfig)
          ? existing.sourceAuthConfig
          : sourceAuthConfig,
        sourceUrl: isUndefined(sourceUrl) ? existing.sourceUrl : sourceUrl,
      });
    }

    // The public push endpoint rejects pipelines without a secret
    const isMissingPushSecret =
      (input.update.mode ?? existing.mode) === 'push' &&
      !isDefined(existing.webhookSecret);

    const update = {
      ...input.update,
      ...(isMissingPushSecret
        ? { webhookSecret: this.generateWebhookSecret() }
        : {}),
    };

    if (Object.keys(update).length > 0) {
      await this.pipelineRepository.update(
        workspaceId,
        { id: input.id },
        update,
      );
    }

    return this.toDTO(await this.findEntityByIdOrThrow(input.id, workspaceId));
  }

  async delete(id: string, workspaceId: string): Promise<IngestionPipelineDTO> {
    const existing = await this.findEntityByIdOrThrow(id, workspaceId);
    const deletedAt = new Date();

    await this.pipelineRepository.update(workspaceId, { id }, { deletedAt });

    return this.toDTO({ ...existing, deletedAt });
  }
}
