import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { IngestionPipelineWebhookController } from 'src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller';
import { IngestionLogRetentionCronCommand } from 'src/engine/metadata-modules/ingestion-pipeline/crons/commands/ingestion-log-retention.cron.command';
import { IngestionPullSchedulesCronCommand } from 'src/engine/metadata-modules/ingestion-pipeline/crons/commands/ingestion-pull-schedules.cron.command';
import { IngestionLogRetentionCronJob } from 'src/engine/metadata-modules/ingestion-pipeline/crons/jobs/ingestion-log-retention.cron.job';
import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionLogEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-log.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPipelineGraphqlApiExceptionInterceptor } from 'src/engine/metadata-modules/ingestion-pipeline/interceptors/ingestion-pipeline-graphql-api-exception.interceptor';
import { IngestionPullJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job';
import { IngestionPushProcessJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-push-process.job';
import { ConvosoCallPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor';
import { ConvosoLeadPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-lead.preprocessor';
import { HealthSherpaPolicyPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/healthsherpa-policy.preprocessor';
import { IngestionPreprocessorRegistry } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/ingestion-preprocessor.registry';
import { OldCrmPolicyPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/old-crm-policy.preprocessor';
import { TimeCardPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/time-card.preprocessor';
import { IngestionFieldMappingResolver } from 'src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-field-mapping.resolver';
import { IngestionLogResolver } from 'src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-log.resolver';
import { IngestionPipelineResolver } from 'src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-pipeline.resolver';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionPullSchedulerService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';
import { IngestionRecordProcessorService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service';
import { IngestionRelationResolverService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IngestionPipelineEntity,
      IngestionFieldMappingEntity,
      IngestionLogEntity,
    ]),
    SecureHttpClientModule,
    ThrottlerModule,
  ],
  controllers: [IngestionPipelineWebhookController],
  providers: [
    provideWorkspaceScopedRepository(IngestionPipelineEntity),
    IngestionPipelineService,
    IngestionFieldMappingService,
    IngestionLogService,
    IngestionRecordProcessorService,
    IngestionRelationResolverService,
    IngestionPullSchedulerService,
    IngestionPipelineResolver,
    IngestionFieldMappingResolver,
    IngestionLogResolver,
    IngestionPipelineGraphqlApiExceptionInterceptor,
    HealthSherpaPolicyPreprocessor,
    ConvosoCallPreprocessor,
    ConvosoLeadPreprocessor,
    OldCrmPolicyPreprocessor,
    TimeCardPreprocessor,
    IngestionPreprocessorRegistry,
    IngestionPullJob,
    IngestionPushProcessJob,
    IngestionPullSchedulesCronCommand,
    IngestionLogRetentionCronJob,
    IngestionLogRetentionCronCommand,
  ],
  exports: [
    IngestionPipelineService,
    IngestionFieldMappingService,
    IngestionLogService,
    IngestionPullSchedulerService,
    IngestionPullSchedulesCronCommand,
    IngestionLogRetentionCronCommand,
  ],
})
export class IngestionPipelineModule {}
