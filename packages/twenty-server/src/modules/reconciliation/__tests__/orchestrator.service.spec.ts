// OMNIA-CUSTOM: regression tests for reconciliation stuck-run recovery
// (audit 2026-06-10, finding: "Worker crash mid-job leaves the
// reconciliation permanently stuck in PARSING/MATCHING"; remediation 3.19).

import { Logger } from '@nestjs/common';

import type { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { ReconciliationOrchestratorService } from 'src/modules/reconciliation/orchestrator.service';
import type { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import type { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import {
  STUCK_RUN_THRESHOLD_MS,
  type ReconciliationRecord,
} from 'src/modules/reconciliation/types/reconciliation';

const WORKSPACE_ID = 'workspace-id';
const RECONCILIATION_ID = 'reconciliation-id';

const buildReconciliation = (
  overrides: Partial<ReconciliationRecord>,
): ReconciliationRecord =>
  ({
    id: RECONCILIATION_ID,
    name: 'June BOB',
    carrierConfigId: 'carrier-config-id',
    sheetName: null,
    sourceAttachmentId: null,
    columnMapping: null,
    status: 'UPLOADED',
    stats: null,
    errorMessage: null,
    parsedAt: null,
    matchedAt: null,
    appliedAt: null,
    completedAt: null,
    ...overrides,
  }) as ReconciliationRecord;

describe('ReconciliationOrchestratorService', () => {
  let queue: { add: jest.Mock };
  let dataService: { getReconciliation: jest.Mock };
  let stateMachine: { transition: jest.Mock; setFailed: jest.Mock };
  let service: ReconciliationOrchestratorService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    queue = { add: jest.fn().mockResolvedValue(undefined) };
    dataService = { getReconciliation: jest.fn() };
    stateMachine = {
      transition: jest.fn().mockResolvedValue(undefined),
      setFailed: jest.fn().mockResolvedValue(undefined),
    };

    service = new ReconciliationOrchestratorService(
      queue as unknown as MessageQueueService,
      dataService as unknown as ReconciliationDataService,
      stateMachine as unknown as ReconciliationStateMachineService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('startParsing', () => {
    it('should transition with a parsingStartedAt stamp in stats and enqueue the parse job', async () => {
      dataService.getReconciliation.mockResolvedValue(
        buildReconciliation({ status: 'UPLOADED' }),
      );

      await service.startParsing(WORKSPACE_ID, RECONCILIATION_ID);

      expect(stateMachine.transition).toHaveBeenCalledTimes(1);
      expect(stateMachine.transition).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'UPLOADED',
        'PARSING',
        {
          stats: { parsingStartedAt: expect.any(String) },
        },
      );
      expect(queue.add).toHaveBeenCalledWith('reconciliation-parse', {
        workspaceId: WORKSPACE_ID,
        reconciliationId: RECONCILIATION_ID,
      });
    });

    it('should preserve existing stats counters when stamping parsingStartedAt', async () => {
      dataService.getReconciliation.mockResolvedValue(
        buildReconciliation({
          status: 'FAILED',
          stats: { totalBobRows: 12 } as ReconciliationRecord['stats'],
        }),
      );

      await service.startParsing(WORKSPACE_ID, RECONCILIATION_ID);

      expect(stateMachine.transition).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'FAILED',
        'PARSING',
        {
          stats: {
            totalBobRows: 12,
            parsingStartedAt: expect.any(String),
          },
        },
      );
    });

    it('should force a stuck PARSING run to FAILED before restarting it', async () => {
      const staleStartedAt = new Date(
        Date.now() - STUCK_RUN_THRESHOLD_MS - 60_000,
      ).toISOString();

      dataService.getReconciliation.mockResolvedValue(
        buildReconciliation({
          status: 'PARSING',
          stats: {
            parsingStartedAt: staleStartedAt,
          } as ReconciliationRecord['stats'],
        }),
      );

      await service.startParsing(WORKSPACE_ID, RECONCILIATION_ID);

      expect(stateMachine.transition).toHaveBeenNthCalledWith(
        1,
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'PARSING',
        'FAILED',
        { errorMessage: expect.stringContaining('STUCK_RUN_RECOVERY') },
      );
      expect(stateMachine.transition).toHaveBeenNthCalledWith(
        2,
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'FAILED',
        'PARSING',
        expect.objectContaining({
          stats: expect.objectContaining({
            parsingStartedAt: expect.any(String),
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('should not force-fail a PARSING run younger than the stuck threshold', async () => {
      dataService.getReconciliation.mockResolvedValue(
        buildReconciliation({
          status: 'PARSING',
          stats: {
            parsingStartedAt: new Date(Date.now() - 60_000).toISOString(),
          } as ReconciliationRecord['stats'],
        }),
      );

      await service.startParsing(WORKSPACE_ID, RECONCILIATION_ID);

      // No recovery: the single transition keeps 'PARSING' as the expected
      // current status, which the real state machine rejects (covered by the
      // state-machine spec) — so an in-flight run cannot be double-started.
      expect(stateMachine.transition).toHaveBeenCalledTimes(1);
      expect(stateMachine.transition).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'PARSING',
        'PARSING',
        expect.anything(),
      );
    });
  });

  describe('startMatching', () => {
    it('should transition with a matchingStartedAt stamp in stats and enqueue the match job', async () => {
      dataService.getReconciliation.mockResolvedValue(
        buildReconciliation({
          status: 'REVIEW',
          stats: { totalBobRows: 3 } as ReconciliationRecord['stats'],
        }),
      );

      await service.startMatching(WORKSPACE_ID, RECONCILIATION_ID);

      expect(stateMachine.transition).toHaveBeenCalledTimes(1);
      expect(stateMachine.transition).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'REVIEW',
        'MATCHING',
        {
          stats: {
            totalBobRows: 3,
            matchingStartedAt: expect.any(String),
          },
        },
      );
      expect(queue.add).toHaveBeenCalledWith('reconciliation-match', {
        workspaceId: WORKSPACE_ID,
        reconciliationId: RECONCILIATION_ID,
      });
    });

    it('should treat a stuck MATCHING run with no phase-start stamp as recoverable', async () => {
      // Legacy records created before stamping existed have no
      // matchingStartedAt; they must stay manually recoverable.
      dataService.getReconciliation.mockResolvedValue(
        buildReconciliation({ status: 'MATCHING', stats: null }),
      );

      await service.startMatching(WORKSPACE_ID, RECONCILIATION_ID);

      expect(stateMachine.transition).toHaveBeenNthCalledWith(
        1,
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'MATCHING',
        'FAILED',
        { errorMessage: expect.stringContaining('STUCK_RUN_RECOVERY') },
      );
      expect(stateMachine.transition).toHaveBeenNthCalledWith(
        2,
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'FAILED',
        'MATCHING',
        expect.anything(),
      );
    });

    it('should propagate a recovery CAS conflict instead of enqueueing a duplicate job', async () => {
      // Two concurrent recovery clicks: the loser's PARSING/MATCHING → FAILED
      // CAS fails and the error surfaces to the caller — no duplicate job.
      dataService.getReconciliation.mockResolvedValue(
        buildReconciliation({ status: 'MATCHING', stats: null }),
      );
      stateMachine.transition.mockRejectedValue(
        new Error('Transition conflict'),
      );

      await expect(
        service.startMatching(WORKSPACE_ID, RECONCILIATION_ID),
      ).rejects.toThrow('Transition conflict');

      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
