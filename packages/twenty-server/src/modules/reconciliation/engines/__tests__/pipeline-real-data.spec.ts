/**
 * Tests using real Ambetter BOB data from the 03/10/2026 export.
 * Verifies the full parse → match → status derivation pipeline
 * produces correct results for known real-world scenarios.
 */

import {
  parseAmbetterBob,
  DEFAULT_AMBETTER_COLUMN_MAPPING,
} from 'src/modules/reconciliation/parsers/ambetter';
import {
  matchRow,
  buildMatchIndexes,
  DEFAULT_MATCHING_CONFIG,
  type CrmPolicy,
} from 'src/modules/reconciliation/engines/matching';
import {
  deriveStatus,
  DEFAULT_STATUS_ENGINE_CONFIG,
} from 'src/modules/reconciliation/engines/status';
import { computeFieldDiffs } from 'src/modules/reconciliation/engines/diff';
import { AMBETTER_FIELD_CONFIG } from 'src/modules/reconciliation/config/ambetter.field-config';

// Today's date for status derivation (matches the BOB period)
const TODAY = new Date('2026-04-13');

const makeCrmPolicy = (overrides: Partial<CrmPolicy>): CrmPolicy => ({
  id: 'test-policy-id',
  policyNumber: null,
  applicationId: null,
  effectiveDate: null,
  expirationDate: null,
  status: 'ACTIVE_APPROVED',
  leadFirstName: null,
  leadLastName: null,
  leadDob: null,
  agentName: null,
  agentNpn: null,
  planIdentifier: null,
  leadPhone: null,
  leadEmail: null,
  leadId: null,
  ...overrides,
});

describe('real Ambetter BOB data', () => {
  describe('parser → status engine', () => {
    it('Sara Ghoston: eligible=No → CANCELED (expire=paid through)', () => {
      const rawRow = {
        'Broker Name': 'Alexandria Marrero',
        'Broker NPN': '21340394',
        'Policy Number': 'U94753487',
        'Plan Name': 'Ambetter Balanced Care 12 (2021) + Vision + Adult Dental',
        'Insured First Name': 'Sara',
        'Insured Last Name': 'Ghoston',
        'Broker Effective Date': '2/1/2026',
        'Policy Effective Date': '4/1/2021',
        'Policy Term Date': '8/31/2021',
        'Paid Through Date': '8/31/2021',
        'Member Date Of Birth': '12/30/1963',
        'Eligible for Commission': 'No',
        'Member Phone Number': '2149953244',
        'Member Email': 'ghostonsara8@gmail.com',
      };

      const { normalized } = parseAmbetterBob([rawRow], DEFAULT_AMBETTER_COLUMN_MAPPING);

      expect(normalized).toHaveLength(1);
      const row = normalized[0];

      expect(row.carrierPolicyNumber).toBe('U94753487');
      expect(row.memberFirstName).toBe('Sara');
      expect(row.memberLastName).toBe('Ghoston');
      expect(row.eligibleForCommission).toBe(false);
      // True effective = MAX(broker 2/1/2026, policy 4/1/2021) = 2026-02-01
      expect(row.trueEffectiveDate).toBe('2026-02-01');

      const status = deriveStatus(
        'ambetter-bob-v1',
        {
          trueEffectiveDate: row.trueEffectiveDate,
          paidThroughDate: row.paidThroughDate,
          termDate: row.termDate,
          eligibleForCommission: row.eligibleForCommission,
        },
        [],
        TODAY,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(status?.derivedStatus).toBe('CANCELED');
      // paid through (2021-08-31) is before effective (2026-02-01), so expire = effective
      expect(status?.derivedExpireDate).toBe('2026-02-01');
    });

    it('Brittany Smith: eligible=Yes, paid through 12/31/2026 → ACTIVE_PLACED', () => {
      const rawRow = {
        'Broker Name': 'Alexandria Marrero',
        'Broker NPN': '21340394',
        'Policy Number': 'U71951365',
        'Plan Name': 'Everyday Bronze',
        'Insured First Name': 'Brittany',
        'Insured Last Name': 'Smith',
        'Broker Effective Date': '1/1/2026',
        'Policy Effective Date': '6/1/2024',
        'Policy Term Date': '12/31/2026',
        'Paid Through Date': '12/31/2026',
        'Member Date Of Birth': '6/4/1985',
        'Eligible for Commission': 'Yes',
      };

      const { normalized } = parseAmbetterBob([rawRow], DEFAULT_AMBETTER_COLUMN_MAPPING);
      const row = normalized[0];

      // True effective = MAX(1/1/2026, 6/1/2024) = 2026-01-01
      expect(row.trueEffectiveDate).toBe('2026-01-01');
      expect(row.paidThroughDate).toBe('2026-12-31');

      const status = deriveStatus(
        'ambetter-bob-v1',
        {
          trueEffectiveDate: row.trueEffectiveDate,
          paidThroughDate: row.paidThroughDate,
          termDate: row.termDate,
          eligibleForCommission: row.eligibleForCommission,
        },
        [],
        TODAY,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      // 102 days since effective, paid through is in the future → ACTIVE_PLACED
      expect(status?.derivedStatus).toBe('ACTIVE_PLACED');
    });

    it('Donathon Howard: eligible=Yes, term date 2/28/2026 (past) → CANCELED', () => {
      const rawRow = {
        'Broker Name': 'Alexandria Marrero',
        'Broker NPN': '21340394',
        'Policy Number': 'U72440137',
        'Plan Name': 'Standard Silver',
        'Insured First Name': 'Donathon',
        'Insured Last Name': 'Howard',
        'Broker Effective Date': '2/18/2026',
        'Policy Effective Date': '12/1/2024',
        'Policy Term Date': '2/28/2026',
        'Paid Through Date': '12/31/2025',
        'Member Date Of Birth': '9/14/1988',
        'Eligible for Commission': 'Yes',
      };

      const { normalized } = parseAmbetterBob([rawRow], DEFAULT_AMBETTER_COLUMN_MAPPING);
      const row = normalized[0];

      // True effective = MAX(2/18/2026, 12/1/2024) = 2026-02-18
      expect(row.trueEffectiveDate).toBe('2026-02-18');
      expect(row.termDate).toBe('2026-02-28');

      const status = deriveStatus(
        'ambetter-bob-v1',
        {
          trueEffectiveDate: row.trueEffectiveDate,
          paidThroughDate: row.paidThroughDate,
          termDate: row.termDate,
          eligibleForCommission: row.eligibleForCommission,
        },
        [],
        TODAY,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      // term date 2/28/2026 is in the past → CANCELED
      expect(status?.derivedStatus).toBe('CANCELED');
    });

    it('Jeremy Boudreaux: eligible=Yes, paid through 1/31/2026 (72 days ago) → PAYMENT_ERROR_ACTIVE_PLACED', () => {
      const rawRow = {
        'Broker Name': 'Alexandria Marrero',
        'Broker NPN': '21340394',
        'Policy Number': 'U73500709',
        'Plan Name': 'Everyday Bronze',
        'Insured First Name': 'Jeremy',
        'Insured Last Name': 'Boudreaux',
        'Broker Effective Date': '1/1/2026',
        'Policy Effective Date': '1/1/2026',
        'Policy Term Date': '12/31/2026',
        'Paid Through Date': '1/31/2026',
        'Member Date Of Birth': '2/10/1988',
        'Eligible for Commission': 'Yes',
      };

      const { normalized } = parseAmbetterBob([rawRow], DEFAULT_AMBETTER_COLUMN_MAPPING);
      const row = normalized[0];

      expect(row.trueEffectiveDate).toBe('2026-01-01');
      expect(row.paidThroughDate).toBe('2026-01-31');

      const status = deriveStatus(
        'ambetter-bob-v1',
        {
          trueEffectiveDate: row.trueEffectiveDate,
          paidThroughDate: row.paidThroughDate,
          termDate: row.termDate,
          eligibleForCommission: row.eligibleForCommission,
        },
        [],
        TODAY,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      // 30 days effective→paidThrough (placed), 72 days since paidThrough (payment error)
      expect(status?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
    });
  });

  describe('full pipeline: parse → match → diff', () => {
    it('matches BOB row to CRM policy and detects status discrepancy', () => {
      // Simulate a CRM policy that's currently ACTIVE_APPROVED but BOB says payment error
      const crmPolicy = makeCrmPolicy({
        id: 'crm-jeremy',
        policyNumber: 'U73500709',
        effectiveDate: '2026-01-01',
        status: 'ACTIVE_APPROVED',
        leadFirstName: 'Jeremy',
        leadLastName: 'Boudreaux',
        leadDob: '1988-02-10',
        agentName: 'Alexandria Marrero',
        agentNpn: '21340394',
      });

      const rawRow = {
        'Policy Number': 'U73500709',
        'Broker Name': 'Alexandria Marrero',
        'Broker NPN': '21340394',
        'Insured First Name': 'Jeremy',
        'Insured Last Name': 'Boudreaux',
        'Broker Effective Date': '1/1/2026',
        'Policy Effective Date': '1/1/2026',
        'Policy Term Date': '12/31/2026',
        'Paid Through Date': '1/31/2026',
        'Member Date Of Birth': '2/10/1988',
        'Eligible for Commission': 'Yes',
        'Plan Name': 'Everyday Bronze',
        'Member Phone Number': '9853340462',
        'Member Email': 'boudreauxjeremy40@gmail.com',
      };

      // 1. Parse
      const { normalized } = parseAmbetterBob([rawRow], DEFAULT_AMBETTER_COLUMN_MAPPING);
      const row = normalized[0];

      // 2. Match
      const indexes = buildMatchIndexes([crmPolicy]);
      const decision = matchRow(
        {
          carrierPolicyNumber: row.carrierPolicyNumber,
          brokerName: row.brokerName,
          brokerNpn: row.brokerNpn,
          trueEffectiveDate: row.trueEffectiveDate,
          memberFirstName: row.memberFirstName,
          memberLastName: row.memberLastName,
          memberDob: row.memberDob,
        },
        indexes,
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      expect(decision.crmPolicyId).toBe('crm-jeremy');
      expect(decision.method).toBe('POLICY_NUMBER_DATE_AGENT');
      expect(decision.confidence).toBe(98);

      // 3. Derive status
      const statusResult = deriveStatus(
        'ambetter-bob-v1',
        {
          trueEffectiveDate: row.trueEffectiveDate,
          paidThroughDate: row.paidThroughDate,
          termDate: row.termDate,
          eligibleForCommission: row.eligibleForCommission,
        },
        [crmPolicy],
        TODAY,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(statusResult?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_PLACED');

      // 4. Compute diffs
      const diffs = computeFieldDiffs(
        {
          memberFirstName: row.memberFirstName,
          memberLastName: row.memberLastName,
          memberDob: row.memberDob,
          brokerName: row.brokerName,
          brokerNpn: row.brokerNpn,
          trueEffectiveDate: row.trueEffectiveDate,
          carrierPolicyNumber: row.carrierPolicyNumber,
          planName: row.planName,
          memberPhone: row.memberPhone,
          memberEmail: row.memberEmail,
        },
        {
          status: crmPolicy.status,
          expirationDate: crmPolicy.expirationDate,
          effectiveDate: crmPolicy.effectiveDate,
          policyNumber: crmPolicy.policyNumber,
          planIdentifier: null,
          leadFirstName: crmPolicy.leadFirstName,
          leadLastName: crmPolicy.leadLastName,
          leadDob: crmPolicy.leadDob,
          agentName: crmPolicy.agentName,
          agentNpn: crmPolicy.agentNpn,
          leadPhone: null,
          leadEmail: null,
        },
        statusResult,
        AMBETTER_FIELD_CONFIG,
      );

      // Should detect status discrepancy: ACTIVE_APPROVED → PAYMENT_ERROR_ACTIVE_PLACED
      const statusDiff = diffs.find((d) => d.field === 'status');

      expect(statusDiff).toBeDefined();
      expect(statusDiff?.crmValue).toBe('ACTIVE_APPROVED');
      expect(statusDiff?.bobValue).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
      expect(statusDiff?.severity).toBe('CRITICAL');
    });
  });
});
