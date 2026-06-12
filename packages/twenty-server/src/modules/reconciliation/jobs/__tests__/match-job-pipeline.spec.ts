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
  externalPolicyId: null,
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

  describe('warnings + configFingerprint stamping (OMN-11)', () => {
    const ROWS = [
      { 'Policy Number': 'U300', 'Policy Effective Date': '2025-08-01' },
    ];

    it('stamps stats.configFingerprint (12-hex) and stats.warnings at MATCHING → REVIEW', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          // parserVersion only → boundary emits the deprecated-fallback
          // warning, which must land in the persisted stats.
          statusConfig: null,
        }),
      );
      attachmentService.readParsedData.mockResolvedValue(ROWS);

      await buildMatchJob().handle(JOB_DATA);

      const stats = capturedStats();

      expect(stats.configFingerprint).toMatch(/^[0-9a-f]{12}$/);
      expect(stats.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('This fallback is deprecated'),
        ]),
      );
    });

    it('carries parse-phase warnings into the REVIEW stats and dedupes them', async () => {
      const parsePhaseWarning = 'parse-phase only warning';

      dataService.getReconciliation.mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'MATCHING',
        carrierConfigId: 'carrier-config-id',
        columnMapping: COLUMN_MAPPING,
        stats: {
          // A warning the match boundary will REPEAT (dedupe proof needs a
          // stable string; the fallback warning regenerates identically)…
          warnings: [parsePhaseWarning],
        },
      });
      attachmentService.readParsedData.mockResolvedValue(ROWS);

      await buildMatchJob().handle(JOB_DATA);

      const stats = capturedStats();
      const warnings = stats.warnings as string[];

      // Parse-phase warning survives the wholesale stats replacement…
      expect(warnings).toContain(parsePhaseWarning);
      // …and nothing is duplicated.
      expect(new Set(warnings).size).toBe(warnings.length);
    });

    it('appends a config-drift warning when the parse-time fingerprint differs', async () => {
      dataService.getReconciliation.mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'MATCHING',
        carrierConfigId: 'carrier-config-id',
        columnMapping: COLUMN_MAPPING,
        stats: { configFingerprint: 'deadbeef0000' },
      });
      attachmentService.readParsedData.mockResolvedValue(ROWS);

      await buildMatchJob().handle(JOB_DATA);

      const stats = capturedStats();

      expect(stats.configFingerprint).not.toBe('deadbeef0000');
      expect(stats.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'Carrier config changed between parse and match',
          ),
        ]),
      );
    });

    it('does NOT warn about drift when the fingerprint matches the parse-time stamp', async () => {
      // First run captures the live fingerprint…
      attachmentService.readParsedData.mockResolvedValue(ROWS);
      await buildMatchJob().handle(JOB_DATA);

      const firstStats = capturedStats();
      const liveFingerprint = firstStats.configFingerprint as string;

      // …second run sees the SAME stored config and the parse-time stamp.
      stateMachine.transition.mockClear();
      reviewItemService.reconcileMatchResults.mockClear();
      dataService.getReconciliation.mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'MATCHING',
        carrierConfigId: 'carrier-config-id',
        columnMapping: COLUMN_MAPPING,
        stats: { configFingerprint: liveFingerprint },
      });

      await buildMatchJob().handle(JOB_DATA);

      const stats = capturedStats();

      expect(stats.configFingerprint).toBe(liveFingerprint);
      expect(
        (stats.warnings as string[]).filter((warning) =>
          warning.includes('Carrier config changed between parse and match'),
        ),
      ).toEqual([]);
    });

    it('tolerates older runs without warnings/configFingerprint keys in stats', async () => {
      dataService.getReconciliation.mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'MATCHING',
        carrierConfigId: 'carrier-config-id',
        columnMapping: COLUMN_MAPPING,
        stats: { totalBobRows: 1 }, // legacy stats shape
      });
      attachmentService.readParsedData.mockResolvedValue(ROWS);

      await expect(buildMatchJob().handle(JOB_DATA)).resolves.toBeUndefined();

      const stats = capturedStats();

      expect(stats.configFingerprint).toMatch(/^[0-9a-f]{12}$/);
      expect(Array.isArray(stats.warnings)).toBe(true);
    });
  });

  describe('diffConfig + statusVocabulary threading (OMN-12 tuning depth)', () => {
    // A matched row whose only discrepancy is the agent name. With the
    // default policy the agent.* diff is suppressed and the row confirms
    // (no review item); with diffConfig.suppressAgentFields=false the diff
    // surfaces end-to-end.
    const AGENT_COLUMN_MAPPING = {
      ...COLUMN_MAPPING,
      'Broker Name': {
        crmField: 'agent.name',
        fieldType: 'TEXT',
        fieldKey: 'update:name (agent)',
      },
    };
    const AGENT_ROWS = [
      {
        'Policy Number': 'U300',
        'Policy Effective Date': '2025-08-01',
        'Broker Name': 'Different Agency',
      },
    ];

    const mockAgentScenario = (
      carrierConfigOverrides: Partial<CarrierConfigRecord>,
    ) => {
      dataService.getReconciliation.mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'MATCHING',
        carrierConfigId: 'carrier-config-id',
        columnMapping: AGENT_COLUMN_MAPPING,
      });
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          statusConfig: { engineId: 'ambetter-bob-v1' },
          ...carrierConfigOverrides,
        }),
      );
      dataService.fetchPoliciesForMatching.mockResolvedValue([
        makeCrmPolicy({
          id: 'matched-policy',
          policyNumber: 'U300',
          effectiveDate: '2025-08-01',
          // Agrees with the engine's no-effective-date default assertion
          // (no status roles are mapped), so the agent name is the row's
          // ONLY discrepancy.
          status: 'ACTIVE_APPROVED',
          'agent.name': 'Omnia Insurance',
        }),
      ]);
      attachmentService.readParsedData.mockResolvedValue(AGENT_ROWS);
    };

    it('default policy suppresses agent.* diffs end-to-end (row confirms)', async () => {
      mockAgentScenario({});

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedReviewItems()).toHaveLength(0);
    });

    it('diffConfig.suppressAgentFields=false surfaces the agent diff end-to-end', async () => {
      mockAgentScenario({ diffConfig: { suppressAgentFields: false } });

      await buildMatchJob().handle(JOB_DATA);

      const items = capturedReviewItems();

      expect(items).toHaveLength(1);

      const diffs = items[0].fieldDiffs as { crmField: string | null }[];

      expect(diffs.some((d) => d.crmField === 'agent.name')).toBe(true);
    });

    // A matched row deriving CANCELED over a workspace-added LAPSED CRM
    // status. Default vocabulary: LAPSED is not terminal → status diff +
    // STATUS_CHANGE review item. With statusVocabulary declaring LAPSED
    // terminal, the transition is negative-to-negative noise → confirmed.
    const mockLapsedScenario = (
      carrierConfigOverrides: Partial<CarrierConfigRecord>,
    ) => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          statusConfig: {
            engineId: 'ambetter-bob-v1',
            fieldMapping: {
              effectiveDate: 'Policy Effective Date',
              paidThroughDate: 'Paid Through Date',
              eligibleForCommission: 'Eligible',
            },
          },
          ...carrierConfigOverrides,
        }),
      );
      dataService.fetchPoliciesForMatching.mockResolvedValue([
        makeCrmPolicy({
          id: 'matched-policy',
          policyNumber: 'U300',
          effectiveDate: '2025-08-01',
          status: 'LAPSED',
        }),
      ]);
      // eligible=false → the engine derives CANCELED.
      attachmentService.readParsedData.mockResolvedValue([
        {
          'Policy Number': 'U300',
          'Policy Effective Date': '2025-08-01',
          Eligible: false,
        },
      ]);
    };

    it('default vocabulary surfaces CANCELED-over-LAPSED as a status change', async () => {
      mockLapsedScenario({});

      await buildMatchJob().handle(JOB_DATA);

      const items = capturedReviewItems();

      expect(items).toHaveLength(1);
      expect(items[0].flags).toContain('STATUS_CHANGE');

      const diffs = items[0].fieldDiffs as { crmField: string | null }[];

      expect(diffs.some((d) => d.crmField === 'status')).toBe(true);
    });

    it('statusVocabulary with LAPSED terminal suppresses the transition end-to-end (row confirms)', async () => {
      mockLapsedScenario({
        statusVocabulary: {
          negativeTerminalStatuses: [
            'CANCELED',
            'PAYMENT_ERROR_CANCELED',
            'DECLINED',
            'INCOMPLETE',
            'LAPSED',
          ],
        },
      });

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedReviewItems()).toHaveLength(0);
    });
  });

  describe('identifier roles end-to-end (OMN-12 identity)', () => {
    // Member-ID-centric carrier: the file has NO policy-number column; the
    // member ID column maps to crmField 'applicationId' and
    // matchingConfig.identifierRoles wires the memberId role to it.
    const MEMBER_COLUMN_MAPPING = {
      'Member ID': {
        crmField: 'applicationId',
        fieldType: 'TEXT',
        fieldKey: 'applicationId',
      },
      'Policy Effective Date': {
        crmField: 'effectiveDate',
        fieldType: 'DATE_TIME',
        fieldKey: 'effectiveDate',
      },
    };

    const mockMemberIdScenario = () => {
      dataService.getReconciliation.mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'MATCHING',
        carrierConfigId: 'carrier-config-id',
        columnMapping: MEMBER_COLUMN_MAPPING,
      });
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          name: 'BCBS',
          matchingConfig: { identifierRoles: { memberId: 'applicationId' } },
          statusConfig: { engineId: 'ambetter-bob-v1' },
        }),
      );
      dataService.fetchPoliciesForMatching.mockResolvedValue([
        makeCrmPolicy({
          id: 'member-policy',
          policyNumber: null,
          applicationId: 'APP-001',
          effectiveDate: '2025-08-01',
          // Agrees with the engine's no-roles default derivation, so the
          // effective date is the row's only discrepancy.
          status: 'ACTIVE_APPROVED',
        }),
      ]);
      // BOB effective date differs (later — not the suppressed backwards /
      // Jan-1 rollover shapes) so the matched row surfaces as an UPDATE.
      attachmentService.readParsedData.mockResolvedValue([
        { 'Member ID': 'app-001', 'Policy Effective Date': '2025-09-15' },
      ]);
    };

    it('config → index → match → review item: a member-ID row matches and stamps the identifier into carrierPolicyNumber', async () => {
      mockMemberIdScenario();

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedStats()).toMatchObject({
        totalBobRows: 1,
        autoMatched: 1,
        unmatched: 0,
      });

      const items = capturedReviewItems();

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        matchMethod: 'IDENTIFIER_EXACT',
        policyId: 'member-policy',
        category: 'UPDATE',
        // Review-item identity contract: the file's identifier value lands
        // in carrierPolicyNumber (trim+uppercased), keeping reconcile
        // identity and override learning coherent without a schema change.
        carrierPolicyNumber: 'APP-001',
        carrierName: 'BCBS',
      });

      const diffs = items[0].fieldDiffs as { crmField: string | null }[];

      expect(diffs.some((d) => d.crmField === 'effectiveDate')).toBe(true);
    });

    it('without identifierRoles the same file goes unmatched (gating proof)', async () => {
      mockMemberIdScenario();
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          name: 'BCBS',
          statusConfig: { engineId: 'ambetter-bob-v1' },
        }),
      );

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedStats()).toMatchObject({
        autoMatched: 0,
        unmatched: 1,
      });
    });
  });

  describe('identifier canonicalization end-to-end (OMN-12 identity)', () => {
    it('BCBS-style file value (pattern capture + suffix strip + leading-zero strip) matches the bare CRM policy number', async () => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          name: 'BCBS',
          policyNumberPattern: '^ABC(.+)$',
          matchingConfig: {
            identifierNormalization: {
              stripSuffixPattern: '-\\d+$',
              stripLeadingZeros: true,
            },
          },
          statusConfig: { engineId: 'ambetter-bob-v1' },
        }),
      );
      dataService.fetchPoliciesForMatching.mockResolvedValue([
        makeCrmPolicy({
          id: 'bcbs-policy',
          policyNumber: '123456',
          effectiveDate: '2025-08-01',
          status: 'ACTIVE_APPROVED',
        }),
      ]);
      attachmentService.readParsedData.mockResolvedValue([
        {
          'Policy Number': 'ABC00123456-01',
          'Policy Effective Date': '2025-09-15',
        },
        // Fails the ^ABC gate — the gate tests the RAW value and its skip
        // behavior is unchanged by canonicalization.
        {
          'Policy Number': 'XYZ999',
          'Policy Effective Date': '2025-09-15',
        },
      ]);

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedStats()).toMatchObject({
        totalBobRows: 2,
        autoMatched: 1,
        skippedInvalidPolicyNumber: 1,
      });

      const items = capturedReviewItems();

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        matchMethod: 'POLICY_NUMBER_SINGLE',
        policyId: 'bcbs-policy',
        // The RAW file value stays the stamped identity — canonicalization
        // is a comparison form, not a rewrite of the row's identity.
        carrierPolicyNumber: 'ABC00123456-01',
      });
    });
  });

  describe('dedup strategies (OMN-12 post-match strategies)', () => {
    const TWO_ROWS_ONE_POLICY = [
      {
        __rowNumber: 10,
        'Policy Number': 'U300',
        'Policy Effective Date': '2025-08-15',
      },
      {
        __rowNumber: 20,
        'Policy Number': 'U300',
        'Policy Effective Date': '2025-09-15',
      },
    ];

    const mockDedupScenario = (
      matchingConfig: Record<string, unknown> | null,
    ) => {
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          matchingConfig: matchingConfig as never,
          statusConfig: { engineId: 'ambetter-bob-v1' },
        }),
      );
      dataService.fetchPoliciesForMatching.mockResolvedValue([
        makeCrmPolicy({
          id: 'shared-policy',
          policyNumber: 'U300',
          effectiveDate: '2025-08-01',
          status: 'ACTIVE_APPROVED',
        }),
      ]);
      attachmentService.readParsedData.mockResolvedValue(TWO_ROWS_ONE_POLICY);
    };

    it("default (keepNewestEffectiveDate) keeps one item: the newest row — today's behavior", async () => {
      mockDedupScenario(null);

      await buildMatchJob().handle(JOB_DATA);

      const items = capturedReviewItems();

      expect(items).toHaveLength(1);
      expect(
        (items[0].bobRowSnapshot as Record<string, unknown>)[
          'Policy Effective Date'
        ],
      ).toBe('2025-09-15');
      expect(items[0].carrierPolicyNumber).toBe('U300');
    });

    it('keepAll keeps every row as its own review item with #ROW-suffixed identities', async () => {
      mockDedupScenario({ dedupStrategy: 'keepAll' });

      await buildMatchJob().handle(JOB_DATA);

      const items = capturedReviewItems();

      expect(items).toHaveLength(2);
      expect(
        items.map((item) => item.carrierPolicyNumber).sort(),
      ).toEqual(['U300#ROW10', 'U300#ROW20']);
    });

    it('keepFirst keeps the first row in file order', async () => {
      mockDedupScenario({ dedupStrategy: 'keepFirst' });

      await buildMatchJob().handle(JOB_DATA);

      const items = capturedReviewItems();

      expect(items).toHaveLength(1);
      expect(
        (items[0].bobRowSnapshot as Record<string, unknown>)[
          'Policy Effective Date'
        ],
      ).toBe('2025-08-15');
      expect(items[0].carrierPolicyNumber).toBe('U300');
    });
  });

  describe('narrowing strategies + negativeTerminalStatuses threading (OMN-12 / Wave-5)', () => {
    // Two CRM policies share the policy number; one LAPSED (workspace-added
    // status), one active. The narrowing chain only disambiguates when the
    // per-carrier statusVocabulary declares LAPSED terminal — proving both
    // the configurable chain and the threaded set reach matchRow.
    const mockLapsedPairScenario = (
      carrierConfigOverrides: Partial<CarrierConfigRecord>,
    ) => {
      dataService.getReconciliation.mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'MATCHING',
        carrierConfigId: 'carrier-config-id',
        columnMapping: {
          'Policy Number': {
            crmField: 'policyNumber',
            fieldType: 'TEXT',
            fieldKey: 'policyNumber',
          },
        },
      });
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          statusConfig: { engineId: 'ambetter-bob-v1' },
          ...carrierConfigOverrides,
        }),
      );
      dataService.fetchPoliciesForMatching.mockResolvedValue([
        makeCrmPolicy({
          id: 'lapsed-term',
          policyNumber: 'U300',
          status: 'LAPSED',
        }),
        makeCrmPolicy({
          id: 'active-term',
          policyNumber: 'U300',
          status: 'ACTIVE_PLACED',
        }),
      ]);
      attachmentService.readParsedData.mockResolvedValue([
        { 'Policy Number': 'U300' },
      ]);
    };

    const LAPSED_TERMINAL_VOCABULARY = {
      negativeTerminalStatuses: [
        'CANCELED',
        'PAYMENT_ERROR_CANCELED',
        'DECLINED',
        'INCOMPLETE',
        'LAPSED',
      ],
    };

    it('default vocabulary: LAPSED counts as live, narrowing cannot decide (zero-signal Tier 6 → unmatched)', async () => {
      mockLapsedPairScenario({});

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedStats()).toMatchObject({
        autoMatched: 0,
        unmatched: 1,
      });
    });

    it('statusVocabulary with LAPSED terminal reaches the narrowing chain and picks the active term', async () => {
      mockLapsedPairScenario({
        statusVocabulary: LAPSED_TERMINAL_VOCABULARY,
      });

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedStats()).toMatchObject({
        autoMatched: 1,
        unmatched: 0,
      });

      const items = capturedReviewItems();

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        policyId: 'active-term',
        matchMethod: 'POLICY_NUMBER_SINGLE',
      });
    });

    it('narrowingStrategies: [] disables narrowing even with the terminal set configured', async () => {
      mockLapsedPairScenario({
        matchingConfig: { narrowingStrategies: [] },
        statusVocabulary: LAPSED_TERMINAL_VOCABULARY,
      });

      await buildMatchJob().handle(JOB_DATA);

      expect(capturedStats()).toMatchObject({
        autoMatched: 0,
        unmatched: 1,
      });
    });
  });

  describe('missing-from-BOB + policy-number discovery (OMN-12 dead-knob port)', () => {
    // Discovery needs DOB + member-name roles alongside the policy columns.
    const IDENTITY_COLUMN_MAPPING = {
      ...COLUMN_MAPPING,
      'Member First Name': {
        crmField: 'lead.name.firstName',
        fieldType: 'TEXT',
        fieldKey: 'firstName',
      },
      'Member Last Name': {
        crmField: 'lead.name.lastName',
        fieldType: 'TEXT',
        fieldKey: 'lastName',
      },
      'Member DOB': {
        crmField: 'lead.dateOfBirth',
        fieldType: 'DATE_TIME',
        fieldKey: 'dateOfBirth',
      },
    };

    const mockScenario = ({
      carrierConfig = {},
      policies = [],
      rows = [],
    }: {
      carrierConfig?: Partial<CarrierConfigRecord>;
      policies?: CrmPolicy[];
      rows?: Record<string, unknown>[];
    }) => {
      dataService.getReconciliation.mockResolvedValue({
        id: RECONCILIATION_ID,
        status: 'MATCHING',
        carrierConfigId: 'carrier-config-id',
        columnMapping: IDENTITY_COLUMN_MAPPING,
      });
      dataService.getCarrierConfig.mockResolvedValue(
        baseCarrierConfig({
          policyNumberPattern: '^U',
          statusConfig: { engineId: 'ambetter-bob-v1' },
          ...carrierConfig,
        }),
      );
      dataService.fetchPoliciesForMatching.mockResolvedValue(policies);
      attachmentService.readParsedData.mockResolvedValue(rows);
    };

    const itemsByMethod = (method: string): Record<string, unknown>[] =>
      capturedReviewItems().filter((item) => item.matchMethod === method);

    it('default-off parity: neither phase emits items and stats.missingFromBob stays 0', async () => {
      mockScenario({
        carrierConfig: { matchingConfig: { startDate: null } },
        policies: [
          makeCrmPolicy({ id: 'matched', policyNumber: 'U100' }),
          makeCrmPolicy({ id: 'absent-active', policyNumber: 'U200' }),
          makeCrmPolicy({
            id: 'discovery-bait',
            policyNumber: null,
            status: 'SUBMITTED',
            'lead.dateOfBirth': '1990-05-15',
            effectiveDate: '2025-01-01',
          }),
        ],
        rows: [
          { 'Policy Number': 'U100', 'Policy Effective Date': '2025-08-01' },
          {
            'Policy Number': 'U999',
            'Policy Effective Date': '2025-11-01',
            'Member First Name': 'John',
            'Member Last Name': 'Smith',
            'Member DOB': '1990-05-15',
          },
        ],
      });

      await buildMatchJob().handle(JOB_DATA);

      expect(itemsByMethod('MISSING_FROM_BOB')).toEqual([]);
      expect(itemsByMethod('POLICY_NUMBER_DISCOVERY')).toEqual([]);
      expect(capturedStats()).toMatchObject({ missingFromBob: 0 });
    });

    it('missing-from-BOB end-to-end: absent active policy → item; matched / terminal / pre-start / future / pre-carrier policies → none', async () => {
      mockScenario({
        carrierConfig: {
          matchingConfig: {
            enableMissingFromBob: true,
            startDate: '2025-07-09',
          },
        },
        policies: [
          makeCrmPolicy({ id: 'matched', policyNumber: 'U100' }),
          makeCrmPolicy({ id: 'missing', policyNumber: 'U200' }),
          makeCrmPolicy({
            id: 'terminal',
            policyNumber: 'U300',
            status: 'CANCELED',
          }),
          makeCrmPolicy({
            id: 'pre-start',
            policyNumber: 'U400',
            effectiveDate: '2025-01-01',
          }),
          makeCrmPolicy({
            id: 'future',
            policyNumber: 'U500',
            effectiveDate: '2099-01-01',
          }),
          makeCrmPolicy({
            id: 'pre-carrier',
            policyNumber: null,
            status: 'SUBMITTED',
          }),
        ],
        rows: [
          { 'Policy Number': 'U100', 'Policy Effective Date': '2025-08-01' },
        ],
      });

      await buildMatchJob().handle(JOB_DATA);

      const missingItems = itemsByMethod('MISSING_FROM_BOB');

      expect(missingItems).toHaveLength(1);
      expect(missingItems[0]).toMatchObject({
        name: 'MISSING: U200',
        category: 'UNMATCHED',
        matchMethod: 'MISSING_FROM_BOB',
        decision: 'PENDING',
        confidence: 0,
        policyId: 'missing',
        carrierPolicyNumber: 'U200',
        carrierName: 'Ambetter',
        currentCrmStatus: 'ACTIVE_PLACED',
        fieldDiffs: null,
        bobRowSnapshot: null,
      });
      expect(missingItems[0].matchNotes).toContain(
        'Active CRM policy not present in carrier file',
      );
      expect(capturedStats()).toMatchObject({
        missingFromBob: 1,
        unmatched: 0,
      });
    });

    it('missing-from-BOB scopes its corpus to statusVocabulary.activeStatuses (the intended consumer)', async () => {
      mockScenario({
        carrierConfig: {
          matchingConfig: { enableMissingFromBob: true, startDate: null },
          statusVocabulary: { activeStatuses: ['GRACE_PERIOD'] },
        },
        policies: [
          makeCrmPolicy({
            id: 'grace',
            policyNumber: 'U200',
            status: 'GRACE_PERIOD',
          }),
          // ACTIVE_PLACED is active by DEFAULT vocabulary, but the carrier
          // reshaped the set — this one must NOT be flagged.
          makeCrmPolicy({ id: 'placed', policyNumber: 'U300' }),
        ],
        rows: [],
      });

      await buildMatchJob().handle(JOB_DATA);

      const missingItems = itemsByMethod('MISSING_FROM_BOB');

      expect(missingItems).toHaveLength(1);
      expect(missingItems[0]).toMatchObject({ policyId: 'grace' });
      expect(capturedStats()).toMatchObject({ missingFromBob: 1 });
    });

    it('discovery auto: exact DOB + identical name proposes the unmatched row’s number as a policyNumber diff at full confidence', async () => {
      mockScenario({
        carrierConfig: {
          matchingConfig: { enableDiscovery: true, startDate: null },
        },
        policies: [
          makeCrmPolicy({
            id: 'needs-discovery',
            policyNumber: null,
            status: 'SUBMITTED',
            effectiveDate: '2025-08-01',
            'lead.dateOfBirth': '1990-05-15',
          }),
        ],
        rows: [
          {
            'Policy Number': 'U999',
            // > dateToleranceDays from the policy's effective date so the
            // NAME_DOB_DATE tier cannot claim the row first.
            'Policy Effective Date': '2025-11-01',
            'Member First Name': 'John',
            'Member Last Name': 'Smith',
            'Member DOB': '1990-05-15',
          },
        ],
      });

      await buildMatchJob().handle(JOB_DATA);

      const discoveryItems = itemsByMethod('POLICY_NUMBER_DISCOVERY');

      expect(discoveryItems).toHaveLength(1);
      expect(discoveryItems[0]).toMatchObject({
        name: 'DISCOVER: none → U999',
        category: 'UPDATE',
        decision: 'PENDING',
        confidence: 100,
        policyId: 'needs-discovery',
        carrierPolicyNumber: 'U999',
      });
      expect(discoveryItems[0].matchNotes).toContain('Policy# discovery');
      expect(discoveryItems[0].fieldDiffs).toEqual([
        expect.objectContaining({
          field: 'policyNumber',
          bobValue: 'U999',
          crmValue: null,
          action: 'UPDATE',
          crmField: 'policyNumber',
          crmObjectType: 'policy',
        }),
      ]);
      // The row's own UNMATCHED item still exists (v1 kept both records).
      expect(itemsByMethod('UNMATCHED')).toHaveLength(1);
      expect(capturedStats()).toMatchObject({ autoMatched: 1, unmatched: 1 });
    });

    it('discovery suggest: a near-name below discoveryAutoThreshold is capped under autoMatchThreshold', async () => {
      mockScenario({
        carrierConfig: {
          matchingConfig: { enableDiscovery: true, startDate: null },
        },
        policies: [
          makeCrmPolicy({
            id: 'needs-discovery',
            policyNumber: null,
            status: 'SUBMITTED',
            effectiveDate: '2025-08-01',
            'lead.dateOfBirth': '1990-05-15',
          }),
        ],
        rows: [
          {
            'Policy Number': 'U999',
            'Policy Effective Date': '2025-11-01',
            // 'Jhon Smith' vs 'John Smith': combined Jaro-Winkler 0.97 —
            // above the 0.95 suggest gate, below the 0.98 auto gate.
            'Member First Name': 'Jhon',
            'Member Last Name': 'Smith',
            'Member DOB': '1990-05-15',
          },
        ],
      });

      await buildMatchJob().handle(JOB_DATA);

      const discoveryItems = itemsByMethod('POLICY_NUMBER_DISCOVERY');

      expect(discoveryItems).toHaveLength(1);
      // round(0.97 * 100) = 97, capped at autoMatchThreshold (85) - 1 so
      // the review UI's high-confidence batch sweep never auto-applies a
      // mere suggestion.
      expect(discoveryItems[0].confidence).toBe(84);
      expect(capturedStats()).toMatchObject({
        autoMatched: 0,
        needsReview: 1,
      });
    });

    it('discovery: a name below discoveryNameThreshold proposes nothing', async () => {
      mockScenario({
        carrierConfig: {
          matchingConfig: { enableDiscovery: true, startDate: null },
        },
        policies: [
          makeCrmPolicy({
            id: 'needs-discovery',
            policyNumber: null,
            status: 'SUBMITTED',
            effectiveDate: '2025-08-01',
            'lead.dateOfBirth': '1990-05-15',
          }),
        ],
        rows: [
          {
            'Policy Number': 'U999',
            'Policy Effective Date': '2025-11-01',
            'Member First Name': 'Totally',
            'Member Last Name': 'Different',
            'Member DOB': '1990-05-15',
          },
        ],
      });

      await buildMatchJob().handle(JOB_DATA);

      expect(itemsByMethod('POLICY_NUMBER_DISCOVERY')).toEqual([]);
      expect(itemsByMethod('UNMATCHED')).toHaveLength(1);
    });

    it('discovery never proposes a number some CRM policy already owns', async () => {
      mockScenario({
        carrierConfig: {
          matchingConfig: {
            enableDiscovery: true,
            startDate: null,
            // OVERRIDE-only tiers force the row UNMATCHED even though U999
            // exists in the corpus — isolating the index-ownership gate.
            enabledTiers: ['OVERRIDE'],
          },
        },
        policies: [
          makeCrmPolicy({
            id: 'needs-discovery',
            policyNumber: null,
            status: 'SUBMITTED',
            effectiveDate: '2025-08-01',
            'lead.dateOfBirth': '1990-05-15',
          }),
          makeCrmPolicy({ id: 'owner', policyNumber: 'U999' }),
        ],
        rows: [
          {
            'Policy Number': 'U999',
            'Policy Effective Date': '2025-11-01',
            'Member First Name': 'John',
            'Member Last Name': 'Smith',
            'Member DOB': '1990-05-15',
          },
        ],
      });

      await buildMatchJob().handle(JOB_DATA);

      expect(itemsByMethod('POLICY_NUMBER_DISCOVERY')).toEqual([]);
    });

    it('a discovered policy is excluded from missing-from-BOB (both knobs on)', async () => {
      mockScenario({
        carrierConfig: {
          matchingConfig: {
            enableMissingFromBob: true,
            enableDiscovery: true,
            startDate: null,
          },
        },
        policies: [
          // ACTIVE_PLACED with a NON-carrier-shaped number ('^U' fails):
          // a missing-from-BOB candidate AND a discovery candidate.
          makeCrmPolicy({
            id: 'ffm-number',
            policyNumber: 'FFM123',
            status: 'ACTIVE_PLACED',
            effectiveDate: '2025-08-01',
            'lead.dateOfBirth': '1990-05-15',
          }),
        ],
        rows: [
          {
            'Policy Number': 'U777',
            'Policy Effective Date': '2025-11-01',
            'Member First Name': 'John',
            'Member Last Name': 'Smith',
            'Member DOB': '1990-05-15',
          },
        ],
      });

      await buildMatchJob().handle(JOB_DATA);

      const discoveryItems = itemsByMethod('POLICY_NUMBER_DISCOVERY');

      expect(discoveryItems).toHaveLength(1);
      expect(discoveryItems[0]).toMatchObject({
        name: 'DISCOVER: FFM123 → U777',
        policyId: 'ffm-number',
      });
      expect(itemsByMethod('MISSING_FROM_BOB')).toEqual([]);
      expect(capturedStats()).toMatchObject({ missingFromBob: 0 });
    });
  });
});
