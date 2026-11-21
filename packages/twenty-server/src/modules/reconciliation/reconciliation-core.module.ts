import { Module } from '@nestjs/common';

import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { PolicyQueryHookModule } from 'src/modules/policy/query-hooks/policy-query-hook.module';
import { ReconciliationObjectLockdownModule } from 'src/modules/reconciliation/reconciliation-object-lockdown.module';
import { ReconciliationDecisionRuleService } from 'src/modules/reconciliation/services/decision-rule.service';
import { ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';

// The reconciliation services the CLI shares with the API and worker, so OmniaCommandModule
// imports this module instead of re-providing them with a narrower dependency set
@Module({
  imports: [
    PolicyQueryHookModule,
    ReconciliationObjectLockdownModule,
    WorkspaceCacheModule,
  ],
  providers: [
    ReconciliationDecisionRuleService,
    ReconciliationMutationService,
    ReconciliationStateMachineService,
    ReviewItemService,
  ],
  exports: [
    ReconciliationDecisionRuleService,
    ReconciliationMutationService,
    ReconciliationObjectLockdownModule,
    ReconciliationStateMachineService,
    ReviewItemService,
  ],
})
export class ReconciliationCoreModule {}
