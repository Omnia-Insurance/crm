// OMNIA-CUSTOM: regression tests for the compare-and-swap reconciliation
// state machine (audit 2026-06-10, findings: "State machine is not
// compare-and-swap" and "Worker crash mid-job leaves the reconciliation
// permanently stuck"; remediation plan item 3.19).

import { Logger } from '@nestjs/common';

import type { ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';
import {
  POST_STEP_STATUSES,
  ReconciliationStateMachineService,
  TransitionConflictError,
  VALID_TRANSITIONS,
} from 'src/modules/reconciliation/services/state-machine.service';
import type { ReconciliationStatus } from 'src/modules/reconciliation/types/reconciliation';

const WORKSPACE_ID = 'workspace-id';
const RECONCILIATION_ID = 'reconciliation-id';

const ALL_STATUSES: ReconciliationStatus[] = [
  'UPLOADED',
  'PARSING',
  'PARSED',
  'MATCHING',
  'REVIEW',
  'APPLYING',
  'COMPLETED',
  'FAILED',
];

describe('ReconciliationStateMachineService', () => {
  let mutationService: {
    updateReconciliation: jest.Mock;
    updateReconciliationIfStatus: jest.Mock;
    updateReconciliationUnlessStatus: jest.Mock;
  };
  let service: ReconciliationStateMachineService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mutationService = {
      updateReconciliation: jest.fn().mockResolvedValue(undefined),
      updateReconciliationIfStatus: jest.fn().mockResolvedValue(true),
      updateReconciliationUnlessStatus: jest.fn().mockResolvedValue(true),
    };

    service = new ReconciliationStateMachineService(
      mutationService as unknown as ReconciliationMutationService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('VALID_TRANSITIONS map', () => {
    // The Record<ReconciliationStatus, ReconciliationStatus[]> typing is the
    // compile-time guarantee; these assertions catch runtime drift.
    it('should have an entry for every ReconciliationStatus', () => {
      expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(
        [...ALL_STATUSES].sort(),
      );
    });

    it('should only reference known statuses as targets', () => {
      for (const targets of Object.values(VALID_TRANSITIONS)) {
        for (const target of targets) {
          expect(ALL_STATUSES).toContain(target);
        }
      }
    });

    it('should keep APPLYING as a dead state with no outgoing transitions', () => {
      expect(VALID_TRANSITIONS.APPLYING).toEqual([]);
    });

    it('should not allow any transition into APPLYING', () => {
      for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
        expect({ from, allowsApplying: targets.includes('APPLYING') }).toEqual({
          from,
          allowsApplying: false,
        });
      }
    });

    it('should allow REVIEW → COMPLETED as the terminal transition', () => {
      expect(VALID_TRANSITIONS.REVIEW).toContain('COMPLETED');
    });

    it('should allow REVIEW → PARSING for a deliberate re-parse (OMN-11)', () => {
      expect(VALID_TRANSITIONS.REVIEW).toContain('PARSING');
    });

    it('should NOT open a COMPLETED → PARSING edge (re-parse is REVIEW-only)', () => {
      expect(VALID_TRANSITIONS.COMPLETED).not.toContain('PARSING');
    });
  });

  describe('transition', () => {
    it('should issue a conditional update keyed on the expected status', async () => {
      await service.transition(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'UPLOADED',
        'PARSING',
      );

      expect(mutationService.updateReconciliationIfStatus).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'UPLOADED',
        { status: 'PARSING' },
      );
      expect(mutationService.updateReconciliation).not.toHaveBeenCalled();
    });

    it('should merge extraData into the conditional update payload', async () => {
      await service.transition(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'REVIEW',
        'COMPLETED',
        { completedAt: '2026-06-10T00:00:00.000Z' },
      );

      expect(mutationService.updateReconciliationIfStatus).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'REVIEW',
        { status: 'COMPLETED', completedAt: '2026-06-10T00:00:00.000Z' },
      );
    });

    it('should throw TransitionConflictError when the CAS update affects zero rows', async () => {
      mutationService.updateReconciliationIfStatus.mockResolvedValue(false);

      const act = service.transition(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'MATCHING',
        'REVIEW',
      );

      await expect(act).rejects.toThrow(TransitionConflictError);
    });

    it('should expose the conflicting statuses on TransitionConflictError', async () => {
      mutationService.updateReconciliationIfStatus.mockResolvedValue(false);

      await expect(
        service.transition(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'PARSING',
          'PARSED',
        ),
      ).rejects.toMatchObject({
        name: 'TransitionConflictError',
        reconciliationId: RECONCILIATION_ID,
        expectedStatus: 'PARSING',
        targetStatus: 'PARSED',
      });
    });

    it('should reject an invalid transition without touching the database', async () => {
      await expect(
        service.transition(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'UPLOADED',
          'REVIEW',
        ),
      ).rejects.toThrow('Invalid status transition: UPLOADED → REVIEW');

      expect(
        mutationService.updateReconciliationIfStatus,
      ).not.toHaveBeenCalled();
    });

    it('should reject the removed REVIEW → APPLYING transition', async () => {
      await expect(
        service.transition(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'REVIEW',
          'APPLYING',
        ),
      ).rejects.toThrow('Invalid status transition: REVIEW → APPLYING');
    });

    it('should reject transitions out of the dead APPLYING state', async () => {
      await expect(
        service.transition(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'APPLYING',
          'COMPLETED',
        ),
      ).rejects.toThrow(
        'Invalid status transition: APPLYING → COMPLETED. Allowed: none',
      );
    });

    it('should reject in-flight self re-entry (PARSING → PARSING)', async () => {
      // Stuck-run recovery goes FAILED-then-restart instead (orchestrator).
      await expect(
        service.transition(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'PARSING',
          'PARSING',
        ),
      ).rejects.toThrow('Invalid status transition: PARSING → PARSING');
    });

    it('should allow a COMPLETED run to be deliberately re-matched', async () => {
      await service.transition(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'COMPLETED',
        'MATCHING',
      );

      expect(mutationService.updateReconciliationIfStatus).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'COMPLETED',
        { status: 'MATCHING' },
      );
    });

    it('should execute REVIEW → PARSING as a CAS keyed on REVIEW (re-parse, OMN-11)', async () => {
      await service.transition(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'REVIEW',
        'PARSING',
      );

      expect(mutationService.updateReconciliationIfStatus).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'REVIEW',
        { status: 'PARSING' },
      );
    });

    it('should surface a CAS conflict on REVIEW → PARSING (concurrent restart loses cleanly)', async () => {
      mutationService.updateReconciliationIfStatus.mockResolvedValue(false);

      await expect(
        service.transition(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'REVIEW',
          'PARSING',
        ),
      ).rejects.toMatchObject({
        name: 'TransitionConflictError',
        expectedStatus: 'REVIEW',
        targetStatus: 'PARSING',
      });
    });
  });

  describe('setFailed', () => {
    it('should write FAILED conditionally, excluding post-step statuses', async () => {
      await service.setFailed(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'MATCH',
        new Error('boom'),
      );

      expect(
        mutationService.updateReconciliationUnlessStatus,
      ).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        POST_STEP_STATUSES,
        {
          status: 'FAILED',
          errorMessage: '[MATCH] boom',
        },
      );
      expect(POST_STEP_STATUSES).toEqual(['REVIEW', 'COMPLETED']);
    });

    it('should not throw when the conditional write is skipped (post-step state)', async () => {
      mutationService.updateReconciliationUnlessStatus.mockResolvedValue(false);

      await expect(
        service.setFailed(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'PARSE',
          new Error('stale retry'),
        ),
      ).resolves.toBeUndefined();
    });

    it('should truncate long error messages to 500 characters', async () => {
      await service.setFailed(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'PARSE',
        new Error('x'.repeat(600)),
      );

      const [, , , data] =
        mutationService.updateReconciliationUnlessStatus.mock.calls[0];

      expect((data.errorMessage as string).length).toBe(
        '[PARSE] '.length + 500,
      );
    });

    it('should swallow write failures instead of crashing the catch block', async () => {
      mutationService.updateReconciliationUnlessStatus.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.setFailed(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'MATCH',
          new Error('boom'),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
