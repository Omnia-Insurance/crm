import { Module } from '@nestjs/common';

import { EventLogCleanupModule } from 'src/engine/core-modules/event-logs/cleanup/event-log-cleanup.module';
import { ImportJobValidatedRowsRetentionModule } from 'src/engine/core-modules/import-job/crons/import-job-validated-rows-retention.module';
import { ImportJobModule } from 'src/engine/core-modules/import-job/import-job.module';
import { ImportJobProcessorModule } from 'src/engine/core-modules/import-job/jobs/import-job-processor.module';
import { IngestionPipelineModule } from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.module';
import { AgentProfileModule } from 'src/modules/agent-profile/agent-profile.module';
import { AgentRollupModule } from 'src/modules/agent-rollup/agent-rollup.module';
import { CallQueryHookModule } from 'src/modules/call/query-hooks/call-query-hook.module';
import { DashboardAudienceModule } from 'src/modules/dashboard/dashboard-audience/dashboard-audience.module';
import { PersonQueryHookModule } from 'src/modules/lead/query-hooks/person-query-hook.module';
import { OmniaSiblingSessionModule } from 'src/modules/omnia-sibling-session/omnia-sibling-session.module';
import { PolicyQueryHookModule } from 'src/modules/policy/query-hooks/policy-query-hook.module';
import { ReconciliationModule } from 'src/modules/reconciliation/reconciliation.module';
import { RoleObjectSettingsModule } from 'src/modules/role-object-settings/role-object-settings.module';

@Module({
  imports: [
    PolicyQueryHookModule,
    CallQueryHookModule,
    PersonQueryHookModule,
    AgentProfileModule,
    ReconciliationModule,
    DashboardAudienceModule,
    AgentRollupModule,
    RoleObjectSettingsModule,
    IngestionPipelineModule,
    ImportJobModule,
    ImportJobProcessorModule,
    ImportJobValidatedRowsRetentionModule,
    OmniaSiblingSessionModule,
    // cron:register:all schedules EventLogCleanup hourly, but upstream loads its processor only in the
    // command app; without this the worker drops the job and the event-log retention setting deletes nothing
    EventLogCleanupModule,
  ],
})
export class OmniaModulesModule {}
