import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionLogEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-log.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPullJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job';
import { IngestionPushProcessJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-push-process.job';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionRecordProcessorService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service';
import { IngestionRelationResolverService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IngestionPipelineEntity,
      IngestionFieldMappingEntity,
      IngestionLogEntity,
    ]),
  ],
  providers: [
    IngestionPushProcessJob,
    IngestionPullJob,
    IngestionPipelineService,
    IngestionFieldMappingService,
    IngestionLogService,
    IngestionRecordProcessorService,
    IngestionRelationResolverService,
  ],
})
export class IngestionJobModule {}
