// OMNIA-CUSTOM: regression tests for the job-start status re-read guards and
// clean exits on CAS transition conflicts (audit 2026-06-10, finding: "State
// machine is not compare-and-swap"; remediation plan item 3.19). Only the
// job-start / status-transition behavior is covered here — the match job's
// persist/stamping logic has its own coverage.

import { Logger } from '@nestjs/common';

import type { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { ReconciliationMatchJob } from 'src/modules/reconciliation/jobs/match.job';
import { ReconciliationParseJob } from 'src/modules/reconciliation/jobs/parse.job';
import type { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import type { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import type { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';
import {
  TransitionConflictError,
  type ReconciliationStateMachineService,
} from 'src/modules/reconciliation/services/state-machine.service';

const WORKSPACE_ID = 'workspace-id';
const RECONCILIATION_ID = 'reconciliation-id';

const JOB_DATA = {
  workspaceId: WORKSPACE_ID,
  reconciliationId: RECONCILIATION_ID,
};

const COLUMN_MAPPING = {
  'Policy Number': {
    crmField: 'policyNumber',
    fieldType: 'TEXT',
    fieldKey: 'policyNumber',
  },
};

describe('reconciliation job status guards', () => {
  let dataService: {
    getReconciliation: jest.Mock;
    getCarrierConfig: jest.Mock;
    fetchPoliciesForMatching: jest.Mock;
    enrichMatchedPolicies: jest.Mock;
  };
  let attachmentService: {
    readSourceFile: jest.Mock;
    writeParsedData: jest.Mock;
    readParsedData: jest.Mock;
  };
  let stateMachine: { transition: jest.Mock; setFailed: jest.Mock };
  let queue: { add: jest.Mock };
  let reviewItemService: {
    reconcileMatchResults: jest.Mock;
    applyLearnedRulesForReconciliation: jest.Mock;
    fetchOverrides: jest.Mock;
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    dataService = {
      getReconciliation: jest.fn(),
      getCarrierConfig: jest.fn(),
      fetchPoliciesForMatching: jest.fn().mockResolvedValue([]),
      enrichMatchedPolicies: jest.fn().mockResolvedValue(new Map()),
    };
    attachmentService = {
      readSourceFile: jest.fn(),
      writeParsedData: jest.fn().mockResolvedValue(undefined),
      readParsedData: jest.fn().mockResolvedValue([]),
    };
    stateMachine = {
      transition: jest.fn().mockResolvedValue(undefined),
      setFailed: jest.fn().mockResolvedValue(undefined),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    reviewItemService = {
      reconcileMatchResults: jest.fn().mockResolvedValue(undefined),
      applyLearnedRulesForReconciliation: jest
        .fn()
        .mockResolvedValue({ updatedCount: 0, skippedCount: 0 }),
      fetchOverrides: jest.fn().mockResolvedValue([]),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildParseJob = () =>
    new ReconciliationParseJob(
      dataService as unknown as ReconciliationDataService,
      attachmentService as unknown as ReconciliationAttachmentService,
      stateMachine as unknown as ReconciliationStateMachineService,
      queue as unknown as MessageQueueService,
    );

  const buildMatchJob = () =>
    new ReconciliationMatchJob(
      dataService as unknown as ReconciliationDataService,
      attachmentService as unknown as ReconciliationAttachmentService,
      stateMachine as unknown as ReconciliationStateMachineService,
      reviewItemService as unknown as ReviewItemService,
    );

  describe('ReconciliationParseJob', () => {
    it('should exit cleanly without side effects when status is not PARSING (stale delivery)', async () => {
      dataService.getReconciliation.mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'REVIEW',
        carrierConfigId: 'carrier-config-id',
        columnMapping: COLUMN_MAPPING,
      });

      await expect(buildParseJob().handle(JOB_DATA)).resolves.toBeUndefined();

      expect(dataService.getCarrierConfig).not.toHaveBeenCalled();
      expect(attachmentService.readSourceFile).not.toHaveBeenCalled();
      expect(stateMachine.transition).not.toHaveBeenCalled();
      expect(stateMachine.setFailed).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should exit cleanly without setFailed on a TransitionConflictError', async () => {
      // The conflict can surface from any CAS transition inside the job; the
      // first awaited call stands in for that path without needing the full
      // xlsx parsing machinery.
      dataService.getReconciliation.mockRejectedValue(
        new TransitionConflictError(RECONCILIATION_ID, 'PARSING', 'PARSED'),
      );

      await expect(buildParseJob().handle(JOB_DATA)).resolves.toBeUndefined();

      expect(stateMachine.setFailed).not.toHaveBeenCalled();
    });

    it('should still setFailed and rethrow on a non-conflict error', async () => {
      dataService.getReconciliation.mockRejectedValue(new Error('boom'));

      await expect(buildParseJob().handle(JOB_DATA)).rejects.toThrow('boom');

      expect(stateMachine.setFailed).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'PARSE',
        expect.any(Error),
      );
    });
  });

  describe('ReconciliationMatchJob', () => {
    const matchingReconciliation = {
      id: RECONCILIATION_ID,
      status: 'MATCHING',
      carrierConfigId: 'carrier-config-id',
      columnMapping: COLUMN_MAPPING,
    };

    const carrierConfig = {
      id: 'carrier-config-id',
      name: 'Ambetter',
      parserVersion: 'ambetter-bob-v1',
      fieldConfig: null,
      matchingConfig: null,
      statusConfig: null,
      carrierId: null,
      policyNumberPattern: null,
    };

    it('should exit cleanly without side effects when status is not MATCHING (stale delivery)', async () => {
      dataService.getReconciliation.mockResolvedValue({
        ...matchingReconciliation,
        status: 'REVIEW',
      });

      await expect(buildMatchJob().handle(JOB_DATA)).resolves.toBeUndefined();

      expect(dataService.getCarrierConfig).not.toHaveBeenCalled();
      expect(reviewItemService.reconcileMatchResults).not.toHaveBeenCalled();
      expect(stateMachine.transition).not.toHaveBeenCalled();
      expect(stateMachine.setFailed).not.toHaveBeenCalled();
    });

    it('should exit cleanly without setFailed when the MATCHING → REVIEW CAS loses', async () => {
      dataService.getReconciliation.mockResolvedValue(matchingReconciliation);
      dataService.getCarrierConfig.mockResolvedValue(carrierConfig);
      stateMachine.transition.mockRejectedValue(
        new TransitionConflictError(RECONCILIATION_ID, 'MATCHING', 'REVIEW'),
      );

      await expect(buildMatchJob().handle(JOB_DATA)).resolves.toBeUndefined();

      expect(stateMachine.transition).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'MATCHING',
        'REVIEW',
        expect.anything(),
      );
      expect(stateMachine.setFailed).not.toHaveBeenCalled();
    });

    it('should still setFailed and rethrow on a non-conflict error', async () => {
      dataService.getReconciliation.mockResolvedValue(matchingReconciliation);
      dataService.getCarrierConfig.mockRejectedValue(new Error('boom'));

      await expect(buildMatchJob().handle(JOB_DATA)).rejects.toThrow('boom');

      expect(stateMachine.setFailed).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'MATCH',
        expect.any(Error),
      );
    });
  });
});
