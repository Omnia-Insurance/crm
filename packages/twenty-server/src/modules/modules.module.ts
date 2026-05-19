import { Module } from '@nestjs/common';

import { CalendarModule } from 'src/modules/calendar/calendar.module';
import { ConnectedAccountModule } from 'src/modules/connected-account/connected-account.module';
import { MessagingModule } from 'src/modules/messaging/messaging.module';
// OMNIA-CUSTOM: Payment Reconciliation v2
import { ReconciliationModule } from 'src/modules/reconciliation/reconciliation.module';
// OMNIA-CUSTOM: CRM-owned Telephony runtime
import { TelephonyModule } from 'src/modules/telephony/telephony.module';
import { WorkflowModule } from 'src/modules/workflow/workflow.module';
import { WorkspaceMemberModule } from 'src/modules/workspace-member/workspace-member.module';

@Module({
  imports: [
    MessagingModule,
    CalendarModule,
    ConnectedAccountModule,
    WorkflowModule,
    WorkspaceMemberModule,
    ReconciliationModule,
    TelephonyModule,
  ],
  providers: [],
  exports: [],
})
export class ModulesModule {}
