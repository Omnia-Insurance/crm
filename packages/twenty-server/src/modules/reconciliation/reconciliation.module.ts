import { Module } from '@nestjs/common';

import { FileModule } from 'src/engine/core-modules/file/file.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { ReconciliationMatchJob } from 'src/modules/reconciliation/jobs/match.job';
import { ReconciliationParseJob } from 'src/modules/reconciliation/jobs/parse.job';
import { ReconciliationOrchestratorService } from 'src/modules/reconciliation/orchestrator.service';
import { CarrierConfigQueryHookModule } from 'src/modules/reconciliation/query-hooks/carrier-config-query-hook.module';
import { ReconciliationCoreModule } from 'src/modules/reconciliation/reconciliation-core.module';
import { ReconciliationResolver } from 'src/modules/reconciliation/reconciliation.resolver';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { CarrierConfigValidationService } from 'src/modules/reconciliation/services/carrier-config-validation.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';

@Module({
  imports: [
    ReconciliationCoreModule,
    CarrierConfigQueryHookModule,
    FileModule,
    WorkspaceCacheModule,
  ],
  providers: [
    ReconciliationResolver,
    ReconciliationDataService,
    ReconciliationAttachmentService,
    CarrierConfigValidationService,
    ReconciliationOrchestratorService,
    ReconciliationParseJob,
    ReconciliationMatchJob,
  ],
  exports: [ReconciliationCoreModule, ReconciliationOrchestratorService],
})
export class ReconciliationModule {}
