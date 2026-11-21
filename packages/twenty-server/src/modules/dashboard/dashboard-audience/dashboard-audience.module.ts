import { Module } from '@nestjs/common';

import { FieldMetadataModule } from 'src/engine/metadata-modules/field-metadata/field-metadata.module';
import { RowLevelPermissionModule } from 'src/engine/metadata-modules/row-level-permission-predicate/row-level-permission.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';
import { DashboardAudienceRoleSyncListener } from 'src/modules/dashboard/dashboard-audience/listeners/dashboard-audience-role-sync.listener';
import { DashboardAudienceQueryHookModule } from 'src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-query-hook.module';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';

@Module({
  imports: [
    DashboardAudienceQueryHookModule,
    FieldMetadataModule,
    RowLevelPermissionModule,
    WorkspaceCacheModule,
    WorkspaceMigrationModule,
  ],
  providers: [
    DashboardAudienceRoleSyncService,
    DashboardAudienceRoleSyncListener,
  ],
  exports: [DashboardAudienceRoleSyncService],
})
export class DashboardAudienceModule {}
