import {
  invertColumnMapping,
  resolveBobValue,
  type ColumnMapping,
  type ComputedFieldDef,
} from '@/reconciliation/utils/invertColumnMapping';

const OSCAR_MAPPING: ColumnMapping = {
  'Member ID': {
    crmField: 'policyNumber',
    fieldType: 'TEXT',
    fieldKey: 'policyNumber',
  },
  'Coverage Start': {
    crmField: 'effectiveDate',
    fieldType: 'DATE_TIME',
    fieldKey: 'effectiveDate',
  },
  'First Name': {
    crmField: 'lead.name.firstName',
    fieldType: 'FULL_NAME',
    fieldKey: 'name.firstName',
  },
};

const COMPUTED_EFFECTIVE_DATE: ComputedFieldDef[] = [
  {
    outputKey: 'True Effective Date',
    method: 'maxDate',
    inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
    type: 'date',
    crmField: 'effectiveDate',
  },
];

describe('invertColumnMapping', () => {
  it('inverts header → crmField into crmField → header', () => {
    const lookup = invertColumnMapping(OSCAR_MAPPING);

    expect(lookup.get('policyNumber')).toEqual({
      mappedHeader: 'Member ID',
      fieldType: 'TEXT',
    });
    expect(lookup.get('lead.name.firstName')?.mappedHeader).toBe('First Name');
  });

  it('keeps the first header when two columns map to the same crmField', () => {
    const lookup = invertColumnMapping({
      'Policy Term Date': {
        crmField: 'expirationDate',
        fieldType: 'DATE_TIME',
        fieldKey: 'expirationDate',
      },
      'Broker Term Date': {
        crmField: 'expirationDate',
        fieldType: 'DATE_TIME',
        fieldKey: 'expirationDate',
      },
    });

    expect(lookup.get('expirationDate')?.mappedHeader).toBe(
      'Policy Term Date',
    );
  });

  it('layers computed output keys onto mapped entries', () => {
    const lookup = invertColumnMapping(OSCAR_MAPPING, COMPUTED_EFFECTIVE_DATE);

    expect(lookup.get('effectiveDate')).toEqual({
      mappedHeader: 'Coverage Start',
      fieldType: 'DATE_TIME',
      computedKey: 'True Effective Date',
    });
  });

  it('returns computed-only entries when the mapping is null', () => {
    const lookup = invertColumnMapping(null, COMPUTED_EFFECTIVE_DATE);

    expect(lookup.get('effectiveDate')).toEqual({
      computedKey: 'True Effective Date',
    });
  });

  it('skips computed fields without a crmField', () => {
    const lookup = invertColumnMapping(null, [
      { outputKey: 'Some Derived Key', method: 'coalesce' },
    ]);

    expect(lookup.size).toBe(0);
  });
});

describe('resolveBobValue', () => {
  it('resolves through the mapped header, winning over legacy literals', () => {
    const lookup = invertColumnMapping(OSCAR_MAPPING);
    const snapshot = {
      'Member ID': 'OSC-123',
      policy_number: 'LEGACY-999',
    };

    expect(
      resolveBobValue(snapshot, lookup, 'policyNumber', ['policy_number']),
    ).toBe('OSC-123');
  });

  it('does not fall back to legacy literals when the mapped cell is empty', () => {
    // A mapped-but-empty cell is real data — falling through to a stale
    // legacy key would resurrect values from another carrier's vocabulary.
    const lookup = invertColumnMapping(OSCAR_MAPPING);
    const snapshot = {
      'Member ID': null,
      policy_number: 'LEGACY-999',
    };

    expect(
      resolveBobValue(snapshot, lookup, 'policyNumber', ['policy_number']),
    ).toBeNull();
  });

  it('prefers the computed output key over the mapped header when the snapshot carries it', () => {
    const lookup = invertColumnMapping(OSCAR_MAPPING, COMPUTED_EFFECTIVE_DATE);
    const snapshot = {
      'True Effective Date': '2026-03-01',
      'Coverage Start': '2026-01-01',
    };

    expect(
      resolveBobValue(snapshot, lookup, 'effectiveDate', [
        'policy_effective_date',
      ]),
    ).toBe('2026-03-01');
  });

  it('falls back to the mapped header when the snapshot predates the computed key', () => {
    const lookup = invertColumnMapping(OSCAR_MAPPING, COMPUTED_EFFECTIVE_DATE);
    const snapshot = { 'Coverage Start': '2026-01-01' };

    expect(resolveBobValue(snapshot, lookup, 'effectiveDate')).toBe(
      '2026-01-01',
    );
  });

  it('uses legacy Ambetter literals only when the mapping has no entry', () => {
    const lookup = invertColumnMapping(OSCAR_MAPPING);
    const snapshot = {
      inusred_first_name: undefined,
      insured_last_name: 'Doe',
    };

    // No mapping entry for lastName → legacy literal applies
    expect(
      resolveBobValue(snapshot, lookup, 'lead.name.lastName', [
        'insured_last_name',
      ]),
    ).toBe('Doe');

    // Legacy keys resolve in order, skipping null/undefined values
    expect(
      resolveBobValue(snapshot, lookup, 'lead.name.lastName', [
        'inusred_first_name',
        'insured_last_name',
      ]),
    ).toBe('Doe');
  });

  it('returns null when nothing resolves', () => {
    const lookup = invertColumnMapping(null);

    expect(resolveBobValue({}, lookup, 'policyNumber', ['policy_number'])).toBeNull();
  });
});
