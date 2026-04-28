import { Module } from '@nestjs/common';

import { FileModule } from 'src/engine/core-modules/file/file.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { CommissionMatchJob } from 'src/modules/reconciliation/jobs/commission-match.job';
import { CommissionParseJob } from 'src/modules/reconciliation/jobs/commission-parse.job';
import { ReconciliationMatchJob } from 'src/modules/reconciliation/jobs/match.job';
import { ReconciliationParseJob } from 'src/modules/reconciliation/jobs/parse.job';
import { ReconciliationOrchestratorService } from 'src/modules/reconciliation/orchestrator.service';
import { ReconciliationResolver } from 'src/modules/reconciliation/reconciliation.resolver';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { CommissionService } from 'src/modules/reconciliation/services/commission.service';
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
    CommissionService,
    ReconciliationOrchestratorService,
    // Job processors (auto-discovered by message queue explorer)
    ReconciliationParseJob,
    ReconciliationMatchJob,
    CommissionParseJob,
    CommissionMatchJob,
  ],
  exports: [ReconciliationOrchestratorService],
})
export class ReconciliationModule {}
