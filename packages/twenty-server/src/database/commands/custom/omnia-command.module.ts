import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { AdoptBrokerageAppCommand } from 'src/database/commands/custom/adopt-brokerage-app.command';
import { BackfillReconciliationDecisionRulesCommand } from 'src/database/commands/custom/backfill-reconciliation-decision-rules.command';
import { BackfillTimeCardsCommand } from 'src/database/commands/custom/backfill-time-cards.command';
import { ComputeAgentRollupsCommand } from 'src/database/commands/custom/compute-agent-rollups.command';
import { RunLegacyTypeOrmMigrationsCommand } from 'src/database/commands/custom/run-legacy-typeorm-migrations.command';
import { SeedAmbetterCarrierConfigCommand } from 'src/database/commands/custom/seed-ambetter-carrier-config.command';
import { SeedCarrierConfigCommand } from 'src/database/commands/custom/seed-carrier-config.command';
import { SeedConvosoCallPipelineCommand } from 'src/database/commands/custom/seed-convoso-call-pipeline.command';
import { SeedConvosoTimeCardPipelineCommand } from 'src/database/commands/custom/seed-convoso-time-card-pipeline.command';
import { SeedHealthSherpaPipelineCommand } from 'src/database/commands/custom/seed-healthsherpa-pipeline.command';
import { SeedReconciliationObjectsCommand } from 'src/database/commands/custom/seed-reconciliation-objects.command';
import { SyncDashboardAudienceCommand } from 'src/database/commands/custom/sync-dashboard-audience.command';
import { OmniaVerifyPermissionsCommand } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/omnia-verify-permissions.command';
import { OmniaPermissionsVerificationService } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { ImportJobValidatedRowsRetentionModule } from 'src/engine/core-modules/import-job/crons/import-job-validated-rows-retention.module';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { FieldMetadataModule } from 'src/engine/metadata-modules/field-metadata/field-metadata.module';
import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPipelineModule } from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.module';
import { NavigationMenuItemEntity } from 'src/engine/metadata-modules/navigation-menu-item/entities/navigation-menu-item.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { AgentRollupModule } from 'src/modules/agent-rollup/agent-rollup.module';
import { DashboardAudienceModule } from 'src/modules/dashboard/dashboard-audience/dashboard-audience.module';
import { ReconciliationCoreModule } from 'src/modules/reconciliation/reconciliation-core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FieldMetadataEntity,
      IngestionFieldMappingEntity,
      IngestionPipelineEntity,
      NavigationMenuItemEntity,
      ObjectMetadataEntity,
    ]),
    AgentRollupModule,
    ApplicationModule,
    DashboardAudienceModule,
    FieldMetadataModule,
    ImportJobValidatedRowsRetentionModule,
    IngestionPipelineModule,
    ObjectMetadataModule,
    ReconciliationCoreModule,
    WorkspaceCacheModule,
    WorkspaceIteratorModule,
  ],
  providers: [
    AdoptBrokerageAppCommand,
    BackfillReconciliationDecisionRulesCommand,
    BackfillTimeCardsCommand,
    ComputeAgentRollupsCommand,
    RunLegacyTypeOrmMigrationsCommand,
    SeedAmbetterCarrierConfigCommand,
    SeedCarrierConfigCommand,
    SeedConvosoCallPipelineCommand,
    SeedConvosoTimeCardPipelineCommand,
    SeedHealthSherpaPipelineCommand,
    SeedReconciliationObjectsCommand,
    SyncDashboardAudienceCommand,
    OmniaVerifyPermissionsCommand,
    OmniaPermissionsVerificationService,
    provideWorkspaceScopedRepository(FieldMetadataEntity),
    provideWorkspaceScopedRepository(IngestionPipelineEntity),
    provideWorkspaceScopedRepository(NavigationMenuItemEntity),
    provideWorkspaceScopedRepository(ObjectMetadataEntity),
  ],
  // CronRegisterAllCommand injects the cron commands these modules export
  exports: [
    AgentRollupModule,
    ImportJobValidatedRowsRetentionModule,
    IngestionPipelineModule,
  ],
})
export class OmniaCommandModule {}
