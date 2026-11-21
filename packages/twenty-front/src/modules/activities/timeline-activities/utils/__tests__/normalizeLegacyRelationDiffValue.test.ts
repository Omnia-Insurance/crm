import { findFieldMetadataItemByDiffKey } from '@/activities/timeline-activities/utils/findFieldMetadataItemByDiffKey';
import { normalizeLegacyRelationDiffValue } from '@/activities/timeline-activities/utils/normalizeLegacyRelationDiffValue';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

const AGENT_FIELD_METADATA_ITEM: FieldMetadataItem = {
  id: 'agent-field-id',
  universalIdentifier: 'agent-field-id',
  name: 'agent',
  label: 'Agent',
  type: FieldMetadataType.RELATION,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const CARRIER_NAME_FIELD_METADATA_ITEM: FieldMetadataItem = {
  ...AGENT_FIELD_METADATA_ITEM,
  id: 'carrier-name-field-id',
  universalIdentifier: 'carrier-name-field-id',
  name: 'carrierName',
  label: 'Carrier name',
  type: FieldMetadataType.TEXT,
};

const normalizeDiffForKey = (
  diffKey: string,
  fieldDiff: { before: unknown; after: unknown },
) => {
  const fieldMetadataItem = findFieldMetadataItemByDiffKey(
    [AGENT_FIELD_METADATA_ITEM, CARRIER_NAME_FIELD_METADATA_ITEM],
    diffKey,
  );

  if (!isDefined(fieldMetadataItem)) {
    throw new Error(`No field metadata item for diff key ${diffKey}`);
  }

  return normalizeLegacyRelationDiffValue({ fieldDiff, fieldMetadataItem });
};

describe('normalizeLegacyRelationDiffValue', () => {
  it('wraps bare uuids keyed by the relation name', () => {
    expect(
      normalizeDiffForKey('agent', {
        before: 'agent-before-id',
        after: 'agent-after-id',
      }),
    ).toEqual({
      before: { id: 'agent-before-id' },
      after: { id: 'agent-after-id' },
    });
  });

  it('wraps bare uuids keyed by the join column', () => {
    expect(
      normalizeDiffForKey('agentId', {
        before: null,
        after: 'agent-after-id',
      }),
    ).toEqual({
      before: null,
      after: { id: 'agent-after-id' },
    });
  });

  it('keeps the cleared side of a legacy relation diff empty', () => {
    expect(
      normalizeDiffForKey('agent', {
        before: 'agent-before-id',
        after: null,
      }),
    ).toEqual({
      before: { id: 'agent-before-id' },
      after: null,
    });
  });

  it('returns relation diffs that already carry { id } untouched', () => {
    const fieldDiff = {
      before: { id: 'agent-before-id' },
      after: { id: null },
    };

    expect(normalizeDiffForKey('agent', fieldDiff)).toBe(fieldDiff);
  });

  it('returns diffs of non-relation fields untouched', () => {
    const fieldDiff = { before: 'Ambetter', after: 'Oscar' };

    expect(normalizeDiffForKey('carrierName', fieldDiff)).toBe(fieldDiff);
  });

  it('returns an empty relation diff untouched', () => {
    const fieldDiff = { before: undefined, after: undefined };

    expect(
      normalizeLegacyRelationDiffValue({
        fieldDiff,
        fieldMetadataItem: AGENT_FIELD_METADATA_ITEM,
      }),
    ).toBe(fieldDiff);
  });
});
