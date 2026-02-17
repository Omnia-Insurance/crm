import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { type PaginationConfig } from 'src/engine/metadata-modules/ingestion-pipeline/types/pagination-config.type';
import { type SourceAuthConfig } from 'src/engine/metadata-modules/ingestion-pipeline/types/source-auth-config.type';
import { type SourceRequestConfig } from 'src/engine/metadata-modules/ingestion-pipeline/types/source-request-config.type';

@Index('IDX_INGESTION_PIPELINE_WORKSPACE_ID', ['workspaceId'])
@Entity({ name: 'ingestionPipeline', schema: 'core' })
export class IngestionPipelineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false, type: 'uuid' })
  workspaceId: string;

  @Column({ nullable: false })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ nullable: false })
  mode: string;

  @Column({ nullable: false })
  targetObjectNameSingular: string;

  @Column({ type: 'varchar', nullable: true })
  webhookSecret: string | null;

  @Column({ type: 'text', nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceHttpMethod: string | null;

  @Column({ type: 'jsonb', nullable: true })
  sourceAuthConfig: SourceAuthConfig | null;

  @Column({ type: 'jsonb', nullable: true })
  sourceRequestConfig: SourceRequestConfig | null;

  @Column({ type: 'varchar', nullable: true })
  responseRecordsPath: string | null;

  @Column({ type: 'varchar', nullable: true })
  schedule: string | null;

  @Column({ type: 'varchar', nullable: true })
  dedupFieldName: string | null;

  @Column({ type: 'jsonb', nullable: true })
  paginationConfig: PaginationConfig | null;

  @Column({ type: 'boolean', default: false })
  isEnabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
