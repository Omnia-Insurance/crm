import { Injectable, Logger } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import {
  STUCK_RUN_THRESHOLD_MS,
  type ReconciliationJobData,
  type ReconciliationRecord,
  type ReconciliationStatus,
} from 'src/modules/reconciliation/types/reconciliation';

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

    const currentStatus = await this.recoverIfStuck(
      workspaceId,
      reconciliation,
      'PARSING',
      'parsingStartedAt',
    );

    await this.stateMachine.transition(
      workspaceId,
      reconciliationId,
      currentStatus,
      'PARSING',
      {
        // Phase-start stamp for stuck-run detection. Stored in the stats
        // JSON (no dedicated workspace field — see ReconciliationStats).
        stats: {
          ...(reconciliation.stats ?? {}),
          parsingStartedAt: new Date().toISOString(),
        },
      },
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

    const currentStatus = await this.recoverIfStuck(
      workspaceId,
      reconciliation,
      'MATCHING',
      'matchingStartedAt',
    );

    await this.stateMachine.transition(
      workspaceId,
      reconciliationId,
      currentStatus,
      'MATCHING',
      {
        stats: {
          ...(reconciliation.stats ?? {}),
          matchingStartedAt: new Date().toISOString(),
        },
      },
    );

    await this.queue.add<ReconciliationJobData>('reconciliation-match', {
      workspaceId,
      reconciliationId,
    });

    this.logger.log(
      `Enqueued match job for reconciliation ${reconciliationId}`,
    );
  }

  /**
   * Stuck-run escape hatch (audit 2026-06-10 §"Worker crash mid-job"): a
   * worker that dies mid-parse/mid-match never runs its catch/setFailed, so
   * the run sits in PARSING/MATCHING forever and the normal restart paths
   * (which require FAILED) reject it. When the stored status is the
   * in-flight state and its phase-start stamp is older than
   * STUCK_RUN_THRESHOLD_MS, force the run to FAILED via a regular CAS
   * transition and let the FAILED → PARSING/MATCHING restart proceed.
   * Manual recovery is therefore "click start again after the threshold" —
   * the frontend already exposes both start mutations.
   *
   * Data-safety note: the threshold is purely wall-clock, so a slow-but-alive
   * match run that crosses it can be force-failed and superseded while still
   * executing. That is safe because every (re)entry into MATCHING stamps a
   * fresh stats.matchingStartedAt and the match job fences its CRM writes on
   * that stamp (ReconciliationMatchJob.persistMatchResults): a superseded run
   * sees the changed stamp and bails before writing, so recovery can never
   * cause two runs to double-write the same policies.
   *
   * FAILED-then-restart was chosen over direct re-entry
   * (PARSING → PARSING) because it stays entirely inside VALID_TRANSITIONS
   * and CAS-serializes concurrent recovery attempts: two simultaneous
   * clicks both pass the threshold check, but only one wins the
   * PARSING → FAILED CAS — the loser surfaces a TransitionConflictError
   * instead of enqueueing a duplicate job. A missing stamp (records that
   * predate stamping) is treated as stuck so legacy zombies stay
   * recoverable.
   *
   * @returns the status the subsequent transition should CAS against:
   *   'FAILED' after a recovery, otherwise the stored status unchanged.
   */
  private async recoverIfStuck(
    workspaceId: string,
    reconciliation: ReconciliationRecord,
    inFlightStatus: Extract<ReconciliationStatus, 'PARSING' | 'MATCHING'>,
    startedAtKey: 'parsingStartedAt' | 'matchingStartedAt',
  ): Promise<ReconciliationStatus> {
    if (reconciliation.status !== inFlightStatus) {
      return reconciliation.status;
    }

    const startedAt = reconciliation.stats?.[startedAtKey];
    const ageMs = startedAt
      ? Date.now() - new Date(startedAt).getTime()
      : Number.POSITIVE_INFINITY;

    if (ageMs < STUCK_RUN_THRESHOLD_MS) {
      // Recent enough to plausibly still be running — return the stored
      // status and let the transition below reject the re-trigger.
      return reconciliation.status;
    }

    this.logger.warn(
      `Reconciliation ${reconciliation.id} stuck in ${inFlightStatus} ` +
        `(started ${startedAt ?? 'unknown — no phase-start stamp'}) — forcing FAILED before restart`,
    );

    await this.stateMachine.transition(
      workspaceId,
      reconciliation.id,
      inFlightStatus,
      'FAILED',
      {
        errorMessage:
          `[STUCK_RUN_RECOVERY] ${inFlightStatus} since ` +
          `${startedAt ?? 'unknown (no phase-start stamp)'} exceeded the ` +
          `${Math.round(STUCK_RUN_THRESHOLD_MS / 60_000)} min stuck threshold; restarted manually`,
      },
    );

    return 'FAILED';
  }

  // Apply step removed 2026-04-29: review-item decisions no longer trigger
  // a server-side write loop. The frontend's per-record "Accept all" button
  // fires updateOneRecord mutations for the policy + lead in real time, plus
  // the cancel-previous-policy mutation when applicable. Decisions
  // (APPROVED/SKIPPED) are pure bookkeeping after that.
}
