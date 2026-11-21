import { Global, Module } from '@nestjs/common';

import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { DashboardAudienceCreateManyPreQueryHook } from 'src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-many.pre-query.hook';
import { DashboardAudienceCreateOnePreQueryHook } from 'src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-one.pre-query.hook';
import { DashboardAudienceCreatorService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-creator.service';

// Global so the upstream dashboard inserts that skip these hooks (duplication, the AI dashboard tool)
// can tag a gated creator's dashboard without an Omnia import in upstream modules
@Global()
@Module({
  imports: [WorkspaceCacheModule],
  providers: [
    DashboardAudienceCreatorService,
    DashboardAudienceCreateOnePreQueryHook,
    DashboardAudienceCreateManyPreQueryHook,
  ],
  exports: [DashboardAudienceCreatorService],
})
export class DashboardAudienceQueryHookModule {}
