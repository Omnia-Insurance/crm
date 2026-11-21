import { type FieldDiff } from '@/reconciliation/types/FieldDiff';
import { getRelationScopedFieldDiffs } from '@/reconciliation/utils/getRelationScopedFieldDiffs';

const makeFieldDiff = (overrides: Partial<FieldDiff> = {}): FieldDiff => ({
  field: 'Phone',
  label: 'Phone',
  bobValue: '+15550000002',
  crmValue: '+15550000001',
  action: 'UPDATE',
  severity: 'WARNING',
  approval: 'PENDING',
  crmField: 'lead.phones.primaryPhoneNumber',
  crmObjectType: 'lead',
  note: null,
  ...overrides,
});

describe('getRelationScopedFieldDiffs', () => {
  it('keeps the relation diffs and strips the relation prefix', () => {
    expect(
      getRelationScopedFieldDiffs({
        fieldDiffs: [
          makeFieldDiff(),
          makeFieldDiff({ crmField: 'premium', crmObjectType: 'policy' }),
        ],
        relationFieldName: 'lead',
      }),
    ).toEqual([makeFieldDiff({ crmField: 'phones.primaryPhoneNumber' })]);
  });

  it('ignores relations that only share a name prefix', () => {
    expect(
      getRelationScopedFieldDiffs({
        fieldDiffs: [makeFieldDiff({ crmField: 'leadSource.name' })],
        relationFieldName: 'lead',
      }),
    ).toEqual([]);
  });

  it('drops no-op diffs, diffs that clear a value and diffs without a CRM field', () => {
    expect(
      getRelationScopedFieldDiffs({
        fieldDiffs: [
          makeFieldDiff({ bobValue: '+15550000001' }),
          makeFieldDiff({ bobValue: null }),
          makeFieldDiff({ crmField: null }),
        ],
        relationFieldName: 'lead',
      }),
    ).toEqual([]);
  });

  it('re-roots nested name paths for the relation chip', () => {
    expect(
      getRelationScopedFieldDiffs({
        fieldDiffs: [
          makeFieldDiff({
            crmField: 'agent.name',
            crmObjectType: 'policy',
            bobValue: 'Jane Doe',
            crmValue: 'Jane Smith',
          }),
        ],
        relationFieldName: 'agent',
      }).map(({ crmField }) => crmField),
    ).toEqual(['name']);
  });
});
