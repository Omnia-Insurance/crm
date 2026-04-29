import { Module } from '@nestjs/common';

import { FileModule } from 'src/engine/core-modules/file/file.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { ReconciliationMatchJob } from 'src/modules/reconciliation/jobs/match.job';
import { ReconciliationParseJob } from 'src/modules/reconciliation/jobs/parse.job';
import { ReconciliationOrchestratorService } from 'src/modules/reconciliation/orchestrator.service';
import { ReconciliationResolver } from 'src/modules/reconciliation/reconciliation.resolver';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';

// OMNIA-CUSTOM: Payment Reconciliation v2 — native NestJS module for
// BOB ingestion, matching, status derivation, and field diff pipeline.
@Module({
  imports: [GlobalWorkspaceDataSourceModule, FileModule],
  providers: [
    // Resolver (GraphQL mutations for triggering pipeline stages)
    ReconciliationResolver,
    // Services
    ReconciliationDataService,
    ReconciliationMutationService,
    ReconciliationAttachmentService,
    ReconciliationStateMachineService,
    ReviewItemService,
    ReconciliationOrchestratorService,
    // Job processors (auto-discovered by message queue explorer)
    ReconciliationParseJob,
    ReconciliationMatchJob,
  ],
  exports: [ReconciliationOrchestratorService],
})
export class ReconciliationModule {}
