import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { FieldMetadataModule } from 'src/engine/metadata-modules/field-metadata/field-metadata.module';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RowLevelPermissionModule } from 'src/engine/metadata-modules/row-level-permission-predicate/row-level-permission.module';
import { DashboardAudienceRoleSyncListener } from 'src/modules/dashboard/dashboard-audience/listeners/dashboard-audience-role-sync.listener';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';

// OMNIA-CUSTOM: dashboard role-gating. The `audience` MULTI_SELECT field and its
// per-role row-level predicates auto-track workspace roles via an event listener
// (metadata.role.*). The sync service is also exported for the bootstrap command.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ObjectMetadataEntity,
      FieldMetadataEntity,
      RoleEntity,
    ]),
    FieldMetadataModule,
    RowLevelPermissionModule,
  ],
  providers: [
    DashboardAudienceRoleSyncService,
    DashboardAudienceRoleSyncListener,
  ],
  exports: [DashboardAudienceRoleSyncService],
})
export class DashboardAudienceModule {}
