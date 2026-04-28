import {
  computeFieldDiffs,
  summarizeDiffs,
} from 'src/modules/reconciliation/engines/diff';
import { AMBETTER_FIELD_CONFIG } from 'src/modules/reconciliation/config/ambetter.field-config';

describe('diff engine', () => {
  const fieldConfig = AMBETTER_FIELD_CONFIG;

  const baseBobRow = {
    memberFirstName: 'John',
    memberLastName: 'Smith',
    memberDob: '1990-05-15',
    brokerName: 'Omnia Insurance',
    brokerNpn: '12345678',
    trueEffectiveDate: '2026-01-01',
    carrierPolicyNumber: 'U94692964',
    planName: 'Ambetter Gold',
    memberPhone: '555-1234',
    memberEmail: 'john@example.com',
  };

  const baseCrmPolicy = {
    status: 'ACTIVE_PLACED',
    expirationDate: null,
    effectiveDate: '2026-01-01',
    policyNumber: 'U94692964',
    planIdentifier: 'Ambetter Gold',
    leadFirstName: 'John',
    leadLastName: 'Smith',
    leadDob: '1990-05-15',
    agentName: 'Omnia Insurance',
    agentNpn: '12345678',
    leadPhone: '555-1234',
    leadEmail: 'john@example.com',
  };

  it('returns no diffs when everything matches', () => {
    const diffs = computeFieldDiffs(baseBobRow, baseCrmPolicy, null, fieldConfig);

    expect(diffs).toHaveLength(0);
  });

  it('detects status change from status engine', () => {
    const statusDecision = {
      derivedStatus: 'CANCELED' as const,
      derivedExpireDate: '2026-03-01',
      cancelPreviousPolicyId: null,
      statusChangeReason: 'Not eligible for commission',
    };

    const diffs = computeFieldDiffs(baseBobRow, baseCrmPolicy, statusDecision, fieldConfig);
    const statusDiff = diffs.find((d) => d.field === 'status');
    const expireDiff = diffs.find((d) => d.field === 'expirationDate');

    expect(statusDiff).toBeDefined();
    expect(statusDiff?.bobValue).toBe('CANCELED');
    expect(statusDiff?.crmValue).toBe('ACTIVE_PLACED');
    expect(statusDiff?.action).toBe('COMPUTED');
    expect(statusDiff?.severity).toBe('CRITICAL');

    expect(expireDiff).toBeDefined();
    expect(expireDiff?.bobValue).toBe('2026-03-01');
  });

  it('detects name discrepancy', () => {
    const diffs = computeFieldDiffs(
      { ...baseBobRow, memberFirstName: 'Jonathan' },
      baseCrmPolicy,
      null,
      fieldConfig,
    );

    const nameDiff = diffs.find((d) => d.field === 'memberFirstName');

    expect(nameDiff).toBeDefined();
    expect(nameDiff?.bobValue).toBe('Jonathan');
    expect(nameDiff?.crmValue).toBe('John');
    expect(nameDiff?.action).toBe('UPDATE');
    expect(nameDiff?.crmObjectType).toBe('lead');
  });

  it('detects effective date discrepancy', () => {
    const diffs = computeFieldDiffs(
      { ...baseBobRow, trueEffectiveDate: '2026-02-01' },
      baseCrmPolicy,
      null,
      fieldConfig,
    );

    const dateDiff = diffs.find((d) => d.field === 'trueEffectiveDate');

    expect(dateDiff).toBeDefined();
    expect(dateDiff?.bobValue).toBe('2026-02-01');
    expect(dateDiff?.crmValue).toBe('2026-01-01');
  });

  it('marks INFO_ONLY diffs as SKIPPED approval', () => {
    const diffs = computeFieldDiffs(
      { ...baseBobRow, brokerName: 'Different Agency' },
      baseCrmPolicy,
      null,
      fieldConfig,
    );

    const agentDiff = diffs.find((d) => d.field === 'brokerName');

    expect(agentDiff).toBeDefined();
    expect(agentDiff?.action).toBe('INFO_ONLY');
    expect(agentDiff?.approval).toBe('SKIPPED');
  });

  describe('summarizeDiffs', () => {
    it('returns empty string for no diffs', () => {
      expect(summarizeDiffs([])).toBe('');
    });

    it('summarizes up to 3 diffs inline', () => {
      const diffs = computeFieldDiffs(
        {
          ...baseBobRow,
          memberFirstName: 'Jane',
          memberDob: '1991-01-01',
        },
        baseCrmPolicy,
        null,
        fieldConfig,
      );

      const summary = summarizeDiffs(diffs);

      expect(summary).toContain('First Name');
      expect(summary).toContain('Jane');
    });
  });
});
