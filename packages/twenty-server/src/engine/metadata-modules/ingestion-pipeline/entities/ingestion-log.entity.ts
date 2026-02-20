import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { type IngestionError } from 'src/engine/metadata-modules/ingestion-pipeline/types/ingestion-error.type';

import { IngestionPipelineEntity } from './ingestion-pipeline.entity';

@Index('IDX_INGESTION_LOG_PIPELINE_ID', ['pipelineId'])
@Index('IDX_INGESTION_LOG_STARTED_AT', ['startedAt'])
@Entity({ name: 'ingestionLog', schema: 'core' })
export class IngestionLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false, type: 'uuid' })
  pipelineId: string;

  @ManyToOne(
    () => IngestionPipelineEntity,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'pipelineId' })
  pipeline: Relation<IngestionPipelineEntity>;

  @Column({ nullable: false })
  status: string;

  @Column({ nullable: false })
  triggerType: string;

  @Column({ type: 'int', default: 0 })
  totalRecordsReceived: number;

  @Column({ type: 'int', default: 0 })
  recordsCreated: number;

  @Column({ type: 'int', default: 0 })
  recordsUpdated: number;

  @Column({ type: 'int', default: 0 })
  recordsSkipped: number;

  @Column({ type: 'int', default: 0 })
  recordsFailed: number;

  @Column({ type: 'jsonb', nullable: true })
  errors: IngestionError[] | null;

  @Column({ type: 'jsonb', nullable: true })
  incomingPayload: Record<string, unknown>[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;
}
