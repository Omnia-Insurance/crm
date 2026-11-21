import { Module } from '@nestjs/common';

import { ApplicationGrantRoleModule } from 'src/engine/core-modules/application/application-grant-role/application-grant-role.module';
import { CacheLockModule } from 'src/engine/core-modules/cache-lock/cache-lock.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';
import { ReconciliationObjectLockdownListener } from 'src/modules/reconciliation/listeners/reconciliation-object-lockdown.listener';
import { ReconciliationObjectLockdownService } from 'src/modules/reconciliation/services/object-lockdown.service';

@Module({
  imports: [
    ApplicationGrantRoleModule,
    CacheLockModule,
    WorkspaceCacheModule,
    WorkspaceMigrationModule,
  ],
  providers: [
    ReconciliationObjectLockdownService,
    ReconciliationObjectLockdownListener,
  ],
  exports: [ReconciliationObjectLockdownService],
})
export class ReconciliationObjectLockdownModule {}
