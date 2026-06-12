// OMNIA-CUSTOM: query hooks for the carrierConfig workspace object
// (OMN-11 rename guard). Mirrors the policy module's query-hook pattern
// (src/modules/policy/query-hooks/); hook discovery is global
// (WorkspaceQueryHookExplorer scans all providers), so importing this
// module from ReconciliationModule is sufficient registration.

import { Module } from '@nestjs/common';

import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { CarrierConfigUpdateOnePreQueryHook } from 'src/modules/reconciliation/query-hooks/carrier-config-update-one.pre-query.hook';

@Module({
  imports: [GlobalWorkspaceDataSourceModule],
  providers: [CarrierConfigUpdateOnePreQueryHook],
})
export class CarrierConfigQueryHookModule {}
