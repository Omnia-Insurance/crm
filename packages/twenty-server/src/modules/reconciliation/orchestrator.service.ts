import { Injectable, Logger } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import type { ReconciliationJobData } from 'src/modules/reconciliation/types/reconciliation';

@Injectable()
export class ReconciliationOrchestratorService {
  private readonly logger = new Logger(ReconciliationOrchestratorService.name);

  constructor(
    @InjectMessageQueue(MessageQueue.reconciliationQueue)
    private readonly queue: MessageQueueService,
    private readonly dataService: ReconciliationDataService,
    private readonly stateMachine: ReconciliationStateMachineService,
  ) {}

  async startParsing(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<void> {
    const reconciliation = await this.dataService.getReconciliation(
      workspaceId,
      reconciliationId,
    );

    await this.stateMachine.transition(
      workspaceId,
      reconciliationId,
      reconciliation.status,
      'PARSING',
    );

    await this.queue.add<ReconciliationJobData>('reconciliation-parse', {
      workspaceId,
      reconciliationId,
    });

    this.logger.log(
      `Enqueued parse job for reconciliation ${reconciliationId}`,
    );
  }

  async startMatching(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<void> {
    const reconciliation = await this.dataService.getReconciliation(
      workspaceId,
      reconciliationId,
    );

    await this.stateMachine.transition(
      workspaceId,
      reconciliationId,
      reconciliation.status,
      'MATCHING',
    );

    await this.queue.add<ReconciliationJobData>('reconciliation-match', {
      workspaceId,
      reconciliationId,
    });

    this.logger.log(
      `Enqueued match job for reconciliation ${reconciliationId}`,
    );
  }

  // Apply step removed 2026-04-29: review-item decisions no longer trigger
  // a server-side write loop. The frontend's per-record "Accept all" button
  // fires updateOneRecord mutations for the policy + lead in real time, plus
  // the cancel-previous-policy mutation when applicable. Decisions
  // (APPROVED/SKIPPED) are pure bookkeeping after that.
}
