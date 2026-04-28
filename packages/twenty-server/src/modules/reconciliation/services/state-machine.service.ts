import { Injectable, Logger } from '@nestjs/common';

import type { ReconciliationStatus } from 'src/modules/reconciliation/types/reconciliation';
import { ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
  UPLOADED: ['PARSING', 'FAILED'],
  PARSING: ['PARSED', 'FAILED'],
  PARSED: ['MATCHING', 'FAILED'],
  MATCHING: ['REVIEW', 'FAILED'],
  REVIEW: ['APPLYING', 'MATCHING', 'FAILED'],
  APPLYING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['MATCHING'],
  FAILED: ['PARSING', 'MATCHING'],
};

@Injectable()
export class ReconciliationStateMachineService {
  private readonly logger = new Logger(ReconciliationStateMachineService.name);

  constructor(
    private readonly mutationService: ReconciliationMutationService,
  ) {}

  async transition(
    workspaceId: string,
    reconciliationId: string,
    currentStatus: ReconciliationStatus,
    targetStatus: ReconciliationStatus,
    extraData?: Record<string, unknown>,
  ): Promise<void> {
    const allowed = VALID_TRANSITIONS[currentStatus];

    if (!allowed?.includes(targetStatus)) {
      throw new Error(
        `Invalid status transition: ${currentStatus} → ${targetStatus}. Allowed: ${allowed?.join(', ') ?? 'none'}`,
      );
    }

    const updateData: Record<string, unknown> = {
      status: targetStatus,
      ...extraData,
    };

    await this.mutationService.updateReconciliation(
      workspaceId,
      reconciliationId,
      updateData,
    );

    this.logger.log(
      `Reconciliation ${reconciliationId}: ${currentStatus} → ${targetStatus}`,
    );
  }

  async setFailed(
    workspaceId: string,
    reconciliationId: string,
    step: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const truncated = errorMessage.slice(0, 500);

    try {
      await this.mutationService.updateReconciliation(
        workspaceId,
        reconciliationId,
        {
          status: 'FAILED',
          errorMessage: `[${step}] ${truncated}`,
        },
      );

      this.logger.error(
        `Reconciliation ${reconciliationId}: → FAILED at ${step}: ${truncated}`,
      );
    } catch (failError) {
      this.logger.error(
        `CRITICAL: Failed to set FAILED status for reconciliation ${reconciliationId}:`,
        failError,
      );
    }
  }

  // ── Commission Statement state machine ──

  async transitionCommissionStatement(
    workspaceId: string,
    statementId: string,
    currentStatus: string,
    targetStatus: string,
    extraData?: Record<string, unknown>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      status: targetStatus,
      ...extraData,
    };

    await this.mutationService.updateCommissionStatement(
      workspaceId,
      statementId,
      updateData,
    );

    this.logger.log(
      `CommissionStatement ${statementId}: ${currentStatus} → ${targetStatus}`,
    );
  }

  async setCommissionStatementFailed(
    workspaceId: string,
    statementId: string,
    step: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const truncated = errorMessage.slice(0, 500);

    try {
      await this.mutationService.updateCommissionStatement(
        workspaceId,
        statementId,
        {
          status: 'FAILED',
          errorMessage: `[${step}] ${truncated}`,
        },
      );

      this.logger.error(
        `CommissionStatement ${statementId}: → FAILED at ${step}: ${truncated}`,
      );
    } catch (failError) {
      this.logger.error(
        `CRITICAL: Failed to set FAILED status for commission statement ${statementId}:`,
        failError,
      );
    }
  }
}
