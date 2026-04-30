import {
  computeFieldDiffsFromMapping,
  summarizeDiffs,
} from 'src/modules/reconciliation/engines/diff';
import type { ColumnMapping } from 'src/modules/reconciliation/types/reconciliation';

describe('diff engine', () => {
  const baseColumnMapping: ColumnMapping = {
    policy_no: {
      crmField: 'policyNumber',
      fieldType: 'TEXT',
      fieldKey: 'policyNumber',
    },
    member_first: {
      crmField: 'lead.name.firstName',
      fieldType: 'FULL_NAME',
      fieldKey: 'update:firstName-name (lead)',
    },
    member_last: {
      crmField: 'lead.name.lastName',
      fieldType: 'FULL_NAME',
      fieldKey: 'update:lastName-name (lead)',
    },
    broker_name: {
      crmField: 'agent.name',
      fieldType: 'TEXT',
      fieldKey: 'update:name (agent)',
    },
    eff_date: {
      crmField: 'effectiveDate',
      fieldType: 'DATE',
      fieldKey: 'effectiveDate',
    },
  };

  const baseBobRow = {
    policy_no: 'U94692964',
    member_first: 'John',
    member_last: 'Smith',
    broker_name: 'Omnia Insurance',
    eff_date: '2026-01-01',
  };

  const baseCrmPolicy = {
    status: 'ACTIVE_PLACED',
    expirationDate: null,
    effectiveDate: '2026-01-01',
    policyNumber: 'U94692964',
    'lead.name.firstName': 'John',
    'lead.name.lastName': 'Smith',
    'agent.name': 'Omnia Insurance',
  };

  it('returns no diffs when everything matches', () => {
    const diffs = computeFieldDiffsFromMapping(
      baseBobRow,
      baseCrmPolicy,
      null,
      baseColumnMapping,
    );

    expect(diffs).toHaveLength(0);
  });

  it('detects status change from status engine', () => {
    const statusDecision = {
      derivedStatus: 'CANCELED' as const,
      derivedExpireDate: '2026-03-01',
      cancelPreviousPolicyId: null,
      statusChangeReason: 'Not eligible for commission',
    };

    const diffs = computeFieldDiffsFromMapping(
      baseBobRow,
      baseCrmPolicy,
      statusDecision,
      baseColumnMapping,
    );

    const statusDiff = diffs.find((d) => d.crmField === 'status');
    const expireDiff = diffs.find((d) => d.crmField === 'expirationDate');

    expect(statusDiff).toBeDefined();
    expect(statusDiff?.bobValue).toBe('CANCELED');
    expect(statusDiff?.crmValue).toBe('ACTIVE_PLACED');
    expect(statusDiff?.action).toBe('COMPUTED');
    expect(statusDiff?.severity).toBe('CRITICAL');

    expect(expireDiff).toBeDefined();
    expect(expireDiff?.bobValue).toBe('2026-03-01');
  });

  it('detects member name discrepancy past fuzzy threshold', () => {
    const diffs = computeFieldDiffsFromMapping(
      { ...baseBobRow, member_first: 'Beatrice' },
      baseCrmPolicy,
      null,
      baseColumnMapping,
    );

    const nameDiff = diffs.find((d) => d.crmField === 'lead.name.firstName');

    expect(nameDiff).toBeDefined();
    expect(nameDiff?.bobValue).toBe('Beatrice');
    expect(nameDiff?.crmValue).toBe('John');
    expect(nameDiff?.action).toBe('UPDATE');
    expect(nameDiff?.crmObjectType).toBe('lead');
  });

  it('detects effective-date discrepancy', () => {
    const diffs = computeFieldDiffsFromMapping(
      { ...baseBobRow, eff_date: '2026-02-01' },
      baseCrmPolicy,
      null,
      baseColumnMapping,
    );

    const dateDiff = diffs.find((d) => d.crmField === 'effectiveDate');

    expect(dateDiff).toBeDefined();
    expect(dateDiff?.bobValue).toBe('2026-02-01');
    expect(dateDiff?.crmValue).toBe('2026-01-01');
  });

  describe('backwards effectiveDate suppression', () => {
    // Carriers like Ambetter carry forward the original enrollment date in
    // policy_effective_date even after a renewal. Without this suppression
    // the diff engine would propose moving the renewal CRM record's
    // effectiveDate backwards to the prior plan year — almost always wrong.
    it('suppresses backwards effectiveDate moves on column-mapped diffs', () => {
      const diffs = computeFieldDiffsFromMapping(
        // BOB carries forward 2025 enrollment …
        { ...baseBobRow, eff_date: '2025-10-01' },
        // … but CRM is the 2026 renewal record.
        { ...baseCrmPolicy, effectiveDate: '2026-01-01' },
        null,
        baseColumnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'effectiveDate')).toBeUndefined();
    });

    it('still emits a diff for forward effectiveDate corrections', () => {
      const diffs = computeFieldDiffsFromMapping(
        { ...baseBobRow, eff_date: '2026-03-01' },
        { ...baseCrmPolicy, effectiveDate: '2026-01-01' },
        null,
        baseColumnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'effectiveDate')).toBeDefined();
    });

    it('suppresses backwards effectiveDate moves on computed-field diffs', () => {
      // Ambetter wires effectiveDate through a computed field
      // (trueEffectiveDate = maxDate(broker, policy)). Without the guard on
      // the computed-field loop the diff still slips through.
      const columnMapping: ColumnMapping = {
        // No direct effectiveDate mapping — the computed field claims it.
        policy_no: {
          crmField: 'policyNumber',
          fieldType: 'TEXT',
          fieldKey: 'policyNumber',
        },
      };
      const computedFields = [
        {
          outputKey: 'trueEffectiveDate',
          method: 'maxDate',
          inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
          type: 'date',
          crmField: 'effectiveDate',
        },
      ];

      const diffs = computeFieldDiffsFromMapping(
        {
          policy_no: 'U94692964',
          trueEffectiveDate: '2025-10-01',
        },
        { ...baseCrmPolicy, effectiveDate: '2026-01-01' },
        null,
        columnMapping,
        computedFields,
      );

      expect(diffs.find((d) => d.crmField === 'effectiveDate')).toBeUndefined();
    });
  });

  describe('name-like field classification', () => {
    // Regression: agent.name used to be a literal-equality special case in
    // the isNameField check. After unifying the helper to a path-suffix check,
    // verify it still picks fuzzyName comparison (so trailing entity suffixes
    // like " LLC" don't produce false-positive diffs).
    it('uses fuzzyName comparison for agent.name (no diff for entity-suffix variant)', () => {
      const columnMapping: ColumnMapping = {
        broker_name: {
          crmField: 'agent.name',
          fieldType: 'TEXT',
          fieldKey: 'update:name (agent)',
        },
      };

      const diffs = computeFieldDiffsFromMapping(
        { broker_name: 'Omnia Insurance LLC' },
        { 'agent.name': 'Omnia Insurance' },
        null,
        columnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'agent.name')).toBeUndefined();
    });

    // Regression: when the BOB row carries the hyphenated suffix
    // ("Archer-Mckenley") and the CRM has the canonical short form
    // ("Archer"), the fuzzy matcher used to fail because of the equal
    // word-count tiebreak. The hyphen check must work either direction.
    it('matches hyphenated suffix regardless of which side carries it', () => {
      const columnMapping: ColumnMapping = {
        broker_name: {
          crmField: 'agent.name',
          fieldType: 'TEXT',
          fieldKey: 'update:name (agent)',
        },
      };

      const bobLonger = computeFieldDiffsFromMapping(
        { broker_name: 'Chancelyn Archer-Mckenley' },
        { 'agent.name': 'Chancelyn Archer' },
        null,
        columnMapping,
      );
      expect(
        bobLonger.find((d) => d.crmField === 'agent.name'),
      ).toBeUndefined();

      const crmLonger = computeFieldDiffsFromMapping(
        { broker_name: 'Chancelyn Archer' },
        { 'agent.name': 'Chancelyn Archer-Mckenley' },
        null,
        columnMapping,
      );
      expect(
        crmLonger.find((d) => d.crmField === 'agent.name'),
      ).toBeUndefined();
    });
  });

  describe('summarizeDiffs', () => {
    it('returns empty string for no diffs', () => {
      expect(summarizeDiffs([])).toBe('');
    });

    it('summarizes up to 3 diffs inline', () => {
      const diffs = computeFieldDiffsFromMapping(
        { ...baseBobRow, member_first: 'Jane', member_last: 'Doe' },
        baseCrmPolicy,
        null,
        baseColumnMapping,
      );

      const summary = summarizeDiffs(diffs);

      expect(summary).toContain('member_first');
      expect(summary).toContain('Jane');
    });
  });
});
