// OMNIA-CUSTOM: integration-ish tests for the match job's validated config
// boundary (remediation plan 4.2–4.5): fail-fast on unknown status engines
// and malformed carrier-config JSON, partial-config defaults merge, skip
// counters in stats, statusConfig as the single thresholds home, and the
// unified Jackie's-rule audit (note text and flag from one implementation).

import { Logger } from '@nestjs/common';

import type { CrmPolicy } from 'src/modules/reconciliation/engines/matching';
import { ReconciliationMatchJob } from 'src/modules/reconciliation/jobs/match.job';
import type { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import type { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import type { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';
import type { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import type { CarrierConfigRecord } from 'src/modules/reconciliation/types/reconciliation';

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
  'Policy Effective Date': {
    crmField: 'effectiveDate',
    fieldType: 'DATE_TIME',
    fieldKey: 'effectiveDate',
  },
};

const baseCarrierConfig = (
  overrides: Partial<CarrierConfigRecord> = {},
): CarrierConfigRecord => ({
  id: 'carrier-config-id',
  name: 'Ambetter',
  parserVersion: 'ambetter-bob-v1',
  fieldConfig: null,
  matchingConfig: null,
  statusConfig: null,
  carrierId: null,
  policyNumberPattern: null,
  columnMapping: null,
  productMapping: null,
  ...overrides,
});

const makeCrmPolicy = (overrides: Partial<CrmPolicy>): CrmPolicy => ({
  id: 'policy-id',
  policyNumber: 'U94692964',
  applicationId: null,
  effectiveDate: '2025-08-01',
  expirationDate: null,
  paidThroughDate: null,
  status: 'ACTIVE_PLACED',
  applicantCount: null,
  'premium.amountMicros': null,
  'lead.name.firstName': 'John',
  'lead.name.lastName': 'Smith',
  'lead.dateOfBirth': null,
  'lead.addressCustom.addressState': null,
  'agent.name': null,
  'agent.npn': null,
  planIdentifier: null,
  'lead.phones.primaryPhoneNumber': null,
  'lead.emails.primaryEmail': null,
  'lead.id': null,
  ...overrides,
});

describe('ReconciliationMatchJob config boundary (4.2–4.5)', () => {
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
      getReconciliation: jest.fn().mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'MATCHING',
        carrierConfigId: 'carrier-config-id',
        columnMapping: COLUMN_MAPPING,
      }),
      getCarrierConfig: jest.fn().mockResolvedValue(baseCarrierConfig()),
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

  const buildMatchJob = () =>
    new ReconciliationMatchJob(
      dataService as unknown as ReconciliationDataService,
      attachmentService as unknown as ReconciliationAttachmentService,
      stateMachine as unknown as ReconciliationStateMachineService,
      reviewItemService as unknown as ReviewItemService,
    );

  const capturedReviewItems = (): Record<string, unknown>[] =>
    reviewItemService.reconcileMatchResults.mock.calls[0][2];

  const capturedStats = (): Record<string, unknown> =>
    stateMachine.transition.mock.calls[0][4].stats;

  describe('fail-fast at MATCH (4.2/4.3)', () => {
    it('throws on an unknown status engine id before creating any review items', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          statusConfig: { engineId: 'oscar-bob-v1' },
        }),
      );

      await expect(buildMatchJob().handle(JOB_DATA)).rejects.toThrow(
        /unknown status engine "oscar-bob-v1".*ambetter-bob-v1/s,
      );

      expect(reviewItemService.reconcileMatchResults).not.toHaveBeenCalled();
      expect(stateMachine.setFailed).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'MATCH',
        expect.any(Error),
      );
    });

    it('throws an actionable error on malformed matchingConfig JSON instead of a mid-row TypeError', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          matchingConfig: { enabledTiers: 'POLICY_NUMBER_SINGLE' } as never,
        }),
      );
      attachmentService.readParsedData.mockResolvedValue([
        { 'Policy Number': 'U100', 'Policy Effective Date': '2025-08-01' },
      ]);

      await expect(buildMatchJob().handle(JOB_DATA)).rejects.toThrow(
        /Invalid carrier config "Ambetter".*matchingConfig\.enabledTiers/s,
      );

      expect(reviewItemService.reconcileMatchResults).not.toHaveBeenCalled();
    });

    it('merges a partial matchingConfig over defaults (the audit crash case) and completes', async () => {
      // { autoMatchThreshold: 95 } used to replace the whole config,
      // leaving enabledTiers undefined → TypeError on the first row.
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          matchingConfig: { autoMatchThreshold: 95 },
          statusConfig: { engineId: 'ambetter-bob-v1' },
        }),
      );
      attachmentService.readParsedData.mockResolvedValue([
        { 'Policy Number': 'U100', 'Policy Effective Date': '2025-08-01' },
      ]);

      await expect(buildMatchJob().handle(JOB_DATA)).resolves.toBeUndefined();

      expect(stateMachine.transition).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'MATCHING',
        'REVIEW',
        expect.anything(),
      );
    });
  });

  describe('skip counters in stats (4.4)', () => {
    it('counts rows skipped by startDate and by policyNumberPattern', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          policyNumberPattern: '^U',
          statusConfig: { engineId: 'ambetter-bob-v1' },
        }),
      );
      attachmentService.readParsedData.mockResolvedValue([
        // Before the default Omnia start date (2025-07-09)
        { 'Policy Number': 'U100', 'Policy Effective Date': '2025-01-01' },
        // Fails the ^U pattern
        { 'Policy Number': 'X200', 'Policy Effective Date': '2025-08-01' },
        // Processed (no CRM policies → unmatched)
        { 'Policy Number': 'U300', 'Policy Effective Date': '2025-08-01' },
      ]);

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedStats()).toMatchObject({
        totalBobRows: 3,
        unmatched: 1,
        skippedBeforeStartDate: 1,
        skippedInvalidPolicyNumber: 1,
      });
    });

    it('startDate: null disables the cutoff (per-carrier, Phase 4.4)', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          matchingConfig: { startDate: null },
          statusConfig: { engineId: 'ambetter-bob-v1' },
        }),
      );
      attachmentService.readParsedData.mockResolvedValue([
        { 'Policy Number': 'U100', 'Policy Effective Date': '2024-01-01' },
        { 'Policy Number': 'U300', 'Policy Effective Date': '2025-08-01' },
      ]);

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedStats()).toMatchObject({
        totalBobRows: 2,
        unmatched: 2,
        skippedBeforeStartDate: 0,
        skippedInvalidPolicyNumber: 0,
      });
    });
  });

  describe('status thresholds come from statusConfig only (4.3)', () => {
    it('honors statusConfig.placedThresholdDays (would stay APPROVED under the old hardcoded 30)', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          statusConfig: {
            engineId: 'ambetter-bob-v1',
            placedThresholdDays: 5,
            fieldMapping: {
              effectiveDate: 'Policy Effective Date',
              paidThroughDate: 'Paid Through Date',
            },
          },
        }),
      );
      dataService.fetchPoliciesForMatching.mockResolvedValue([
        makeCrmPolicy({
          id: 'matched-policy',
          policyNumber: 'U300',
          effectiveDate: '2025-08-01',
          status: 'ACTIVE_PLACED',
        }),
      ]);
      // 9 days paid (no full effective month) → placed under threshold 5,
      // NOT placed under the legacy hardcoded 30.
      attachmentService.readParsedData.mockResolvedValue([
        {
          'Policy Number': 'U300',
          'Policy Effective Date': '2025-08-01',
          'Paid Through Date': '2025-08-10',
        },
      ]);

      await buildMatchJob().handle(JOB_DATA);

      const items = capturedReviewItems();

      expect(items).toHaveLength(1);
      // Placed (9 ≥ 5) with stale payment → PAYMENT_ERROR_ACTIVE_PLACED.
      // Under matchingConfig/hardcoded thresholds (30) this would be
      // PAYMENT_ERROR_ACTIVE_APPROVED.
      expect(items[0].derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
    });
  });

  describe("unmatched Jackie's-rule audit (4.5)", () => {
    const statusConfigWithRoles = {
      engineId: 'ambetter-bob-v1',
      fieldMapping: {
        effectiveDate: 'Policy Effective Date',
        paidThroughDate: 'Paid Through Date',
        eligibleForCommission: 'Eligible for Commission',
        brokerEffectiveDate: 'Broker Effective Date',
        policyEffectiveDate: 'Policy Effective Date',
      },
    };

    it('note text and BROKER_EFF_AUDIT flag come from the same rule (no more contradictions)', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({ statusConfig: statusConfigWithRoles }),
      );
      attachmentService.readParsedData.mockResolvedValue([
        {
          'Policy Number': 'U300',
          'Policy Effective Date': '2025-08-01',
          'Broker Effective Date': '2025-09-01',
          'Paid Through Date': '2025-08-15',
          'Eligible for Commission': true,
        },
      ]);

      await buildMatchJob().handle(JOB_DATA);

      const [item] = capturedReviewItems();

      expect(item.category).toBe('UNMATCHED');
      expect(item.flags).toContain('BROKER_EFF_AUDIT');

      const reason = (item.flagReasons as Record<string, string>)
        .BROKER_EFF_AUDIT;

      // The audit reason names the REAL broker-effective column (the old
      // inline copy printed the computed effective date as "broker eff").
      expect(reason).toContain('broker effective 2025-09-01');
      expect(item.matchNotes).toContain(reason);
      expect(item.matchNotes).toContain('flag for audit research');
    });

    it('does not flag when broker effective is not later than policy effective (reviewed precondition)', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({ statusConfig: statusConfigWithRoles }),
      );
      attachmentService.readParsedData.mockResolvedValue([
        {
          'Policy Number': 'U300',
          'Policy Effective Date': '2025-09-01',
          'Broker Effective Date': '2025-08-01',
          'Paid Through Date': '2025-08-15',
          'Eligible for Commission': true,
        },
      ]);

      await buildMatchJob().handle(JOB_DATA);

      const [item] = capturedReviewItems();

      expect(item.flags).not.toContain('BROKER_EFF_AUDIT');
      expect(item.matchNotes).toContain('ACTIVE policy not in CRM');
      expect(item.matchNotes).toContain('broker eff 2025-08-01');
    });

    it('preserves the informational CANCELED note for ineligible rows that fail the precondition', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({ statusConfig: statusConfigWithRoles }),
      );
      attachmentService.readParsedData.mockResolvedValue([
        {
          'Policy Number': 'U300',
          'Policy Effective Date': '2025-09-01',
          'Broker Effective Date': '2025-08-01',
          'Eligible for Commission': false,
        },
      ]);

      await buildMatchJob().handle(JOB_DATA);

      const [item] = capturedReviewItems();

      // Informational note, NOT an audit flag — the reviewed deriveFlags
      // semantics require brokerEff > policyEff for BROKER_EFF_AUDIT.
      expect(item.flags).not.toContain('BROKER_EFF_AUDIT');
      expect(item.matchNotes).toContain('CANCELED in BOB — no CRM match');
    });
  });
});
