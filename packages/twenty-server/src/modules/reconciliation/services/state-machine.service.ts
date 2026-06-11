import { Injectable, Logger } from '@nestjs/common';

import type { ReconciliationStatus } from 'src/modules/reconciliation/types/reconciliation';
import { ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';

/**
 * Thrown when a compare-and-swap transition matched zero rows: the stored
 * status no longer equals the status the caller validated against (a
 * concurrent transition won the race). Jobs treat this as "someone else owns
 * the run now" and exit cleanly without calling setFailed.
 */
export class TransitionConflictError extends Error {
  constructor(
    public readonly reconciliationId: string,
    public readonly expectedStatus: ReconciliationStatus,
    public readonly targetStatus: ReconciliationStatus,
  ) {
    super(
      `Transition conflict for reconciliation ${reconciliationId}: ` +
        `expected stored status ${expectedStatus} (→ ${targetStatus}), but it has changed concurrently`,
    );
    this.name = 'TransitionConflictError';
  }
}

/**
 * Stored statuses a stale job must never stomp back to FAILED: once a newer
 * run has reached a post-step state, the run is healthy and its review items
 * are live.
 */
export const POST_STEP_STATUSES: ReconciliationStatus[] = [
  'REVIEW',
  'COMPLETED',
];

/**
 * Legal status transitions (audit 2026-06-10 remediation 3.19).
 *
 * - APPLYING is a dead state: the server-side apply step was removed
 *   2026-04-29 (see orchestrator.service.ts) and nothing transitions into or
 *   out of it. The type member is kept only because the workspace SELECT
 *   option still exists (seed command, owned elsewhere), so legacy records
 *   may carry the value; the empty list makes it terminal here. A legacy
 *   record stuck in APPLYING can still reach FAILED via setFailed, whose
 *   conditional write bypasses this map.
 * - COMPLETED is a real terminal state reached via REVIEW → COMPLETED when
 *   all review items are decided (trigger wired by the review-item flow);
 *   COMPLETED → MATCHING allows a deliberate re-run.
 */
export const VALID_TRANSITIONS: Record<
  ReconciliationStatus,
  ReconciliationStatus[]
> = {
  UPLOADED: ['PARSING', 'FAILED'],
  PARSING: ['PARSED', 'FAILED'],
  PARSED: ['MATCHING', 'FAILED'],
  MATCHING: ['REVIEW', 'FAILED'],
  REVIEW: ['MATCHING', 'COMPLETED', 'FAILED'],
  APPLYING: [],
  COMPLETED: ['MATCHING'],
  FAILED: ['PARSING', 'MATCHING'],
};

@Injectable()
export class ReconciliationStateMachineService {
  private readonly logger = new Logger(ReconciliationStateMachineService.name);

  constructor(
    private readonly mutationService: ReconciliationMutationService,
  ) {}

  /**
   * Validate and execute a status transition as a compare-and-swap: the
   * UPDATE re-checks `status = currentStatus` in SQL, so of two concurrent
   * writers validating against the same pre-state exactly one wins; the
   * loser gets a TransitionConflictError instead of silently double-firing.
   *
   * Pass `completedAt` (REVIEW → COMPLETED), `parsedAt`, `matchedAt`, etc.
   * via `extraData` to stamp completion timestamps atomically with the
   * status flip.
   */
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
        `Invalid status transition: ${currentStatus} → ${targetStatus}. Allowed: ${allowed?.join(', ') || 'none'}`,
      );
    }

    const updateData: Record<string, unknown> = {
      status: targetStatus,
      ...extraData,
    };

    const updated = await this.mutationService.updateReconciliationIfStatus(
      workspaceId,
      reconciliationId,
      currentStatus,
      updateData,
    );

    if (!updated) {
      throw new TransitionConflictError(
        reconciliationId,
        currentStatus,
        targetStatus,
      );
    }

    this.logger.log(
      `Reconciliation ${reconciliationId}: ${currentStatus} → ${targetStatus}`,
    );
  }

  /**
   * Force the run to FAILED from a job's catch block. Conditional in SQL
   * (`status NOT IN (REVIEW, COMPLETED)`) so a stale job retry that errors
   * after a newer run already reached a post-step state cannot stomp the
   * healthy run while its review items are live.
   */
  async setFailed(
    workspaceId: string,
    reconciliationId: string,
    step: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncated = errorMessage.slice(0, 500);

    try {
      const updated =
        await this.mutationService.updateReconciliationUnlessStatus(
          workspaceId,
          reconciliationId,
          POST_STEP_STATUSES,
          {
            status: 'FAILED',
            errorMessage: `[${step}] ${truncated}`,
          },
        );

      if (!updated) {
        this.logger.warn(
          `Skipped FAILED write for reconciliation ${reconciliationId} at ${step}: ` +
            `stored status is already a post-step state (newer run) or the record is gone`,
        );

        return;
      }

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
}
