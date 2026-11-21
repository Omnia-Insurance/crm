import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type FieldDiff } from '@/reconciliation/types/FieldDiff';
import { getRelationFieldNamesWithPendingDiffs } from '@/reconciliation/utils/getRelationFieldNamesWithPendingDiffs';

const makeFieldDiff = (overrides: Partial<FieldDiff> = {}): FieldDiff => ({
  field: 'member_phone_number',
  label: 'Phone',
  bobValue: '5550001111',
  crmValue: '5559999999',
  action: 'UPDATE',
  severity: 'WARNING',
  approval: 'PENDING',
  crmField: 'lead.phones.primaryPhoneNumber',
  crmObjectType: 'lead',
  note: null,
  ...overrides,
});

const makeLead = (overrides: Partial<ObjectRecord> = {}): ObjectRecord => ({
  id: 'lead-1',
  __typename: 'Person',
  name: { firstName: 'Ada', lastName: 'Lovelace' },
  phones: { primaryPhoneNumber: '5559999999' },
  ...overrides,
});

describe('getRelationFieldNamesWithPendingDiffs', () => {
  it('flags a relation whose related record still holds the CRM value', () => {
    expect(
      getRelationFieldNamesWithPendingDiffs({
        fieldDiffs: [makeFieldDiff()],
        relatedRecordByRelationFieldName: new Map([['lead', makeLead()]]),
      }),
    ).toEqual(['lead']);
  });

  it('stops flagging a relation once its related record holds the BOB value', () => {
    expect(
      getRelationFieldNamesWithPendingDiffs({
        fieldDiffs: [makeFieldDiff()],
        relatedRecordByRelationFieldName: new Map([
          ['lead', makeLead({ phones: { primaryPhoneNumber: '5550001111' } })],
        ]),
      }),
    ).toEqual([]);
  });

  it('flags a relation until every one of its diffs is resolved', () => {
    const fieldDiffs = [
      makeFieldDiff(),
      makeFieldDiff({
        field: 'insured_first_name',
        crmField: 'lead.name.firstName',
        bobValue: 'Augusta',
        crmValue: 'Ada',
      }),
    ];

    expect(
      getRelationFieldNamesWithPendingDiffs({
        fieldDiffs,
        relatedRecordByRelationFieldName: new Map([
          ['lead', makeLead({ phones: { primaryPhoneNumber: '5550001111' } })],
        ]),
      }),
    ).toEqual(['lead']);
  });

  it('compares numbers and empty strings the way the diff stores them', () => {
    const fieldDiffs = [
      makeFieldDiff({
        crmField: 'agent.npn',
        crmObjectType: null,
        bobValue: '12345',
        crmValue: '',
      }),
    ];

    expect(
      getRelationFieldNamesWithPendingDiffs({
        fieldDiffs,
        relatedRecordByRelationFieldName: new Map([
          ['agent', { id: 'agent-1', __typename: 'AgentProfile', npn: 12345 }],
        ]),
      }),
    ).toEqual([]);
  });

  it('keeps a relation collapsed while its related record is not loaded', () => {
    expect(
      getRelationFieldNamesWithPendingDiffs({
        fieldDiffs: [makeFieldDiff()],
        relatedRecordByRelationFieldName: new Map(),
      }),
    ).toEqual([]);
  });

  it('ignores diffs the review cannot apply to a related record', () => {
    const fieldDiffs = [
      makeFieldDiff({ action: 'INFO_ONLY' }),
      makeFieldDiff({ bobValue: null }),
      makeFieldDiff({ bobValue: '5559999999' }),
      makeFieldDiff({ crmField: null }),
    ];

    expect(
      getRelationFieldNamesWithPendingDiffs({
        fieldDiffs,
        relatedRecordByRelationFieldName: new Map([['lead', makeLead()]]),
      }),
    ).toEqual([]);
  });

  it('ignores diffs on the record itself, including composite sub-fields', () => {
    const fieldDiffs = [
      makeFieldDiff({
        crmField: 'premium.amountMicros',
        crmObjectType: 'policy',
        bobValue: '120000000',
        crmValue: '100000000',
      }),
      makeFieldDiff({
        crmField: 'status',
        crmObjectType: 'policy',
        bobValue: 'CANCELED',
        crmValue: 'PLACED',
      }),
    ];

    expect(
      getRelationFieldNamesWithPendingDiffs({
        fieldDiffs,
        relatedRecordByRelationFieldName: new Map([['lead', makeLead()]]),
      }),
    ).toEqual([]);
  });
});
