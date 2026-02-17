import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { type FieldTransform } from 'src/engine/metadata-modules/ingestion-pipeline/types/field-transform.type';

import { IngestionPipelineEntity } from './ingestion-pipeline.entity';

@Index('IDX_INGESTION_FIELD_MAPPING_PIPELINE_ID', ['pipelineId'])
@Entity({ name: 'ingestionFieldMapping', schema: 'core' })
export class IngestionFieldMappingEntity {
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
  sourceFieldPath: string;

  @Column({ nullable: false })
  targetFieldName: string;

  @Column({ type: 'varchar', nullable: true })
  targetCompositeSubField: string | null;

  @Column({ type: 'jsonb', nullable: true })
  transform: FieldTransform | null;

  @Column({ type: 'varchar', nullable: true })
  relationTargetObjectName: string | null;

  @Column({ type: 'varchar', nullable: true })
  relationMatchFieldName: string | null;

  @Column({ type: 'boolean', default: false })
  relationAutoCreate: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;
}
