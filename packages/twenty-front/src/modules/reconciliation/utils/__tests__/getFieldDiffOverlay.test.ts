import { type FieldDiff } from '@/reconciliation/types/FieldDiff';
import { getFieldDiffOverlay } from '@/reconciliation/utils/getFieldDiffOverlay';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const makeFieldDiff = (overrides: Partial<FieldDiff> = {}): FieldDiff => ({
  field: 'Premium',
  label: 'Premium',
  bobValue: '120',
  crmValue: '100',
  action: 'UPDATE',
  severity: 'WARNING',
  approval: 'PENDING',
  crmField: 'premium',
  crmObjectType: 'policy',
  note: null,
  ...overrides,
});

describe('getFieldDiffOverlay', () => {
  it('maps a scalar diff onto its field, CRM value first', () => {
    expect(
      getFieldDiffOverlay({
        fieldDiffs: [makeFieldDiff({ note: 'Carrier repriced the plan' })],
        fieldName: 'premium',
        fieldType: FieldMetadataType.NUMBER,
      }),
    ).toEqual({
      oldValue: '100',
      newValue: '120',
      label: 'Premium',
      crmFieldPath: 'premium',
      note: 'Carrier repriced the plan',
    });
  });

  it('matches a composite sub-field path on its composite field', () => {
    const fieldDiffOverlay = getFieldDiffOverlay({
      fieldDiffs: [
        makeFieldDiff({
          label: 'Email',
          crmField: 'emails.primaryEmail',
          bobValue: 'new@example.com',
          crmValue: 'old@example.com',
        }),
      ],
      fieldName: 'emails',
      fieldType: FieldMetadataType.EMAILS,
    });

    expect(fieldDiffOverlay?.crmFieldPath).toBe('emails.primaryEmail');
    expect(fieldDiffOverlay?.newValue).toBe('new@example.com');
  });

  it('does not match a sub-field path on a non-composite field', () => {
    expect(
      getFieldDiffOverlay({
        fieldDiffs: [makeFieldDiff({ crmField: 'status.reason' })],
        fieldName: 'status',
        fieldType: FieldMetadataType.SELECT,
      }),
    ).toBeUndefined();
  });

  it('does not match a field that only shares the last path segment', () => {
    expect(
      getFieldDiffOverlay({
        fieldDiffs: [makeFieldDiff({ crmField: 'agent.name' })],
        fieldName: 'name',
        fieldType: FieldMetadataType.TEXT,
      }),
    ).toBeUndefined();
  });

  it('skips diffs whose proposed value equals the CRM value', () => {
    expect(
      getFieldDiffOverlay({
        fieldDiffs: [makeFieldDiff({ bobValue: '100', crmValue: '100' })],
        fieldName: 'premium',
        fieldType: FieldMetadataType.NUMBER,
      }),
    ).toBeUndefined();
  });

  it('keeps a diff that proposes clearing the field', () => {
    expect(
      getFieldDiffOverlay({
        fieldDiffs: [
          makeFieldDiff({
            crmField: 'paidThroughDate',
            bobValue: null,
            crmValue: '2026-06-30',
          }),
        ],
        fieldName: 'paidThroughDate',
        fieldType: FieldMetadataType.DATE,
      }),
    ).toMatchObject({ oldValue: '2026-06-30', newValue: null });
  });

  it('never offers INFO_ONLY diffs or diffs without a CRM field', () => {
    expect(
      getFieldDiffOverlay({
        fieldDiffs: [
          makeFieldDiff({ action: 'INFO_ONLY' }),
          makeFieldDiff({ crmField: null }),
        ],
        fieldName: 'premium',
        fieldType: FieldMetadataType.NUMBER,
      }),
    ).toBeUndefined();
  });

  it('shows the last diff when several target the same composite field', () => {
    expect(
      getFieldDiffOverlay({
        fieldDiffs: [
          makeFieldDiff({
            crmField: 'addressCustom.addressStreet1',
            bobValue: '1 New St',
            crmValue: '1 Old St',
          }),
          makeFieldDiff({
            crmField: 'addressCustom.addressCity',
            bobValue: 'Austin',
            crmValue: 'Dallas',
          }),
        ],
        fieldName: 'addressCustom',
        fieldType: FieldMetadataType.ADDRESS,
      })?.crmFieldPath,
    ).toBe('addressCustom.addressCity');
  });
});
