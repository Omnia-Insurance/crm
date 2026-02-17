import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { type IngestionLogDTO } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/ingestion-log.dto';
import { IngestionLogEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-log.entity';
import { type IngestionError } from 'src/engine/metadata-modules/ingestion-pipeline/types/ingestion-error.type';

@Injectable()
export class IngestionLogService {
  constructor(
    @InjectRepository(IngestionLogEntity)
    private readonly logRepository: Repository<IngestionLogEntity>,
  ) {}

  private toDTO(entity: IngestionLogEntity): IngestionLogDTO {
    return {
      id: entity.id,
      pipelineId: entity.pipelineId,
      status: entity.status,
      triggerType: entity.triggerType,
      totalRecordsReceived: entity.totalRecordsReceived,
      recordsCreated: entity.recordsCreated,
      recordsUpdated: entity.recordsUpdated,
      recordsSkipped: entity.recordsSkipped,
      recordsFailed: entity.recordsFailed,
      errors: entity.errors as Record<string, unknown>[] | null,
      startedAt: entity.startedAt,
      completedAt: entity.completedAt,
      durationMs: entity.durationMs,
    };
  }

  async findByPipelineId(
    pipelineId: string,
    limit = 50,
  ): Promise<IngestionLogDTO[]> {
    const logs = await this.logRepository.find({
      where: { pipelineId },
      order: { startedAt: 'DESC' },
      take: limit,
    });

    return logs.map((log) => this.toDTO(log));
  }

  async createPending(
    pipelineId: string,
    triggerType: string,
  ): Promise<IngestionLogEntity> {
    const log = this.logRepository.create({
      pipelineId,
      status: 'pending',
      triggerType,
      startedAt: new Date(),
    });

    return this.logRepository.save(log);
  }

  async markRunning(logId: string): Promise<void> {
    await this.logRepository.update(logId, {
      status: 'running',
      startedAt: new Date(),
    });
  }

  async markCompleted(
    logId: string,
    stats: {
      totalRecordsReceived: number;
      recordsCreated: number;
      recordsUpdated: number;
      recordsSkipped: number;
      recordsFailed: number;
      errors?: IngestionError[];
    },
  ): Promise<IngestionLogDTO> {
    const log = await this.logRepository.findOneByOrFail({ id: logId });
    const completedAt = new Date();
    const durationMs = log.startedAt
      ? completedAt.getTime() - log.startedAt.getTime()
      : null;

    const status = stats.recordsFailed > 0 ? 'partial' : 'completed';

    log.status = status;
    log.totalRecordsReceived = stats.totalRecordsReceived;
    log.recordsCreated = stats.recordsCreated;
    log.recordsUpdated = stats.recordsUpdated;
    log.recordsSkipped = stats.recordsSkipped;
    log.recordsFailed = stats.recordsFailed;
    log.errors = stats.errors ?? null;
    log.completedAt = completedAt;
    log.durationMs = durationMs;

    const updated = await this.logRepository.save(log);

    return this.toDTO(updated);
  }

  async markFailed(
    logId: string,
    errorMessage: string,
  ): Promise<IngestionLogDTO> {
    const log = await this.logRepository.findOneByOrFail({ id: logId });
    const completedAt = new Date();
    const durationMs = log.startedAt
      ? completedAt.getTime() - log.startedAt.getTime()
      : null;

    log.status = 'failed';
    log.errors = [{ recordIndex: -1, message: errorMessage }];
    log.completedAt = completedAt;
    log.durationMs = durationMs;

    const updated = await this.logRepository.save(log);

    return this.toDTO(updated);
  }
}
