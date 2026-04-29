import { Injectable, Logger } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import type { FieldDiff } from 'src/modules/reconciliation/engines/diff';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';
import type {
  ReconciliationJobData,
  ReconciliationStats,
} from 'src/modules/reconciliation/types/reconciliation';

@Injectable()
export class ReconciliationOrchestratorService {
  private readonly logger = new Logger(ReconciliationOrchestratorService.name);

  constructor(
    @InjectMessageQueue(MessageQueue.reconciliationQueue)
    private readonly queue: MessageQueueService,
    private readonly dataService: ReconciliationDataService,
    private readonly mutationService: ReconciliationMutationService,
    private readonly stateMachine: ReconciliationStateMachineService,
    private readonly reviewItemService: ReviewItemService,
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

    this.logger.log(`Enqueued parse job for reconciliation ${reconciliationId}`);
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

    this.logger.log(`Enqueued match job for reconciliation ${reconciliationId}`);
  }

  async startApplying(
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
      'APPLYING',
    );

    try {
      await this.runApplyInline(workspaceId, reconciliationId);
    } catch (error) {
      await this.stateMachine.setFailed(
        workspaceId,
        reconciliationId,
        'APPLY',
        error,
      );

      throw error;
    }
  }

  private async runApplyInline(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<void> {
    const approvedItems = await this.reviewItemService.fetchApproved(
      workspaceId,
      reconciliationId,
    );

    this.logger.log(
      `Applying ${approvedItems.length} approved items for ${reconciliationId}`,
    );

    let applied = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of approvedItems) {
      const policyId = item.policyId as string | null;
      const fieldDiffs = item.fieldDiffs as FieldDiff[] | null;
      const bobRowSnapshot = item.bobRowSnapshot as Record<string, unknown> | null;

      if (!policyId) {
        skipped++;
        continue;
      }

      try {
        const policyUpdates: Record<string, unknown> = {};
        const leadUpdates: Record<string, unknown> = {};

        if (fieldDiffs) {
          for (const diff of fieldDiffs) {
            if (diff.action === 'INFO_ONLY') continue;
            if (diff.field === '__cancelPreviousPolicy') continue;
            if (diff.bobValue == null) continue;
            if (!diff.crmField) continue;

            if (diff.crmObjectType === 'policy') {
              policyUpdates[diff.crmField] = diff.bobValue;
            } else if (diff.crmObjectType === 'lead') {
              buildLeadUpdate(leadUpdates, diff.crmField, diff.bobValue);
            }
          }
        }

        // Apply policy updates
        if (Object.keys(policyUpdates).length > 0) {
          await this.mutationService.updatePolicy(
            workspaceId,
            policyId,
            policyUpdates,
          );
        }

        // Apply lead updates
        if (Object.keys(leadUpdates).length > 0) {
          const leadId = await this.dataService.getLeadIdForPolicy(
            workspaceId,
            policyId,
          );

          if (leadId) {
            await this.mutationService.updateLead(
              workspaceId,
              leadId,
              leadUpdates,
            );
          }
        }

        // Cancel previous policy version (Section 4.3 — from Fix 3 metadata)
        if (bobRowSnapshot?.__cancelPreviousPolicyId) {
          const cancelId = bobRowSnapshot.__cancelPreviousPolicyId as string;
          const cancelExpire =
            (bobRowSnapshot.__cancelExpireDate as string) ?? null;

          await this.mutationService.updatePolicy(
            workspaceId,
            cancelId,
            { status: 'CANCELED', expirationDate: cancelExpire },
          );
        }

        applied++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to apply item for policy ${policyId}:`,
          error,
        );
      }
    }

    const now = new Date().toISOString();
    const reconciliation = await this.dataService.getReconciliation(
      workspaceId,
      reconciliationId,
    );
    const existingStats = reconciliation.stats ?? ({} as ReconciliationStats);

    await this.stateMachine.transition(
      workspaceId,
      reconciliationId,
      'APPLYING',
      'COMPLETED',
      {
        appliedAt: now,
        completedAt: now,
        stats: { ...existingStats, applied, failed, skipped },
      },
    );

    this.logger.log(
      `Apply complete for ${reconciliationId}: ${applied} applied, ${failed} failed, ${skipped} skipped`,
    );
  }
}

/**
 * Build nested lead update object from a crmField path like 'lead.name.firstName'.
 * Handles composite fields (name, emails, phones, addressCustom).
 */
function buildLeadUpdate(
  updates: Record<string, unknown>,
  crmField: string,
  value: string,
): void {
  const path = crmField.replace(/^lead\./, '');
  const parts = path.split('.');

  if (parts.length === 1) {
    updates[parts[0]] = value;
  } else if (parts.length === 2) {
    const [parent, child] = parts;

    if (!updates[parent] || typeof updates[parent] !== 'object') {
      updates[parent] = {};
    }

    (updates[parent] as Record<string, unknown>)[child] = value;
  }
}
