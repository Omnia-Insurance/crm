import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getAgentProfileJoinColumnNames } from '@/object-record/record-form/utils/getAgentProfileJoinColumnNames';
import { isDefined } from 'twenty-shared/utils';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const opportunity = getMockObjectMetadataItemOrThrow('opportunity');

const getAgentProfileRelationField = (
  fieldName: string,
  fieldOverrides: Partial<FieldMetadataItem> = {},
): FieldMetadataItem => {
  const field = opportunity.fields.find(
    (candidate) => candidate.name === fieldName,
  );

  if (!isDefined(field) || !isDefined(field.relation)) {
    throw new Error(`Missing mock relation field ${fieldName}`);
  }

  return {
    ...field,
    ...fieldOverrides,
    relation: {
      ...field.relation,
      targetObjectMetadata: {
        ...field.relation.targetObjectMetadata,
        nameSingular: 'agentProfile',
      },
    },
  };
};

describe('getAgentProfileJoinColumnNames', () => {
  it('returns the only AgentProfile relation, whatever its name', () => {
    expect(
      getAgentProfileJoinColumnNames([getAgentProfileRelationField('owner')]),
    ).toEqual(['ownerId']);
  });

  it('keeps only the relation named agent when several point to AgentProfile', () => {
    expect(
      getAgentProfileJoinColumnNames([
        getAgentProfileRelationField('pointOfContact', { name: 'managing' }),
        getAgentProfileRelationField('owner', { name: 'agent' }),
      ]),
    ).toEqual(['agentId']);
  });

  it('prefills nothing when several relations point to AgentProfile and none is named agent', () => {
    expect(
      getAgentProfileJoinColumnNames([
        getAgentProfileRelationField('owner'),
        getAgentProfileRelationField('pointOfContact'),
      ]),
    ).toEqual([]);
  });

  it('ignores inactive and to-many AgentProfile relations', () => {
    expect(
      getAgentProfileJoinColumnNames([
        getAgentProfileRelationField('owner'),
        getAgentProfileRelationField('pointOfContact', { isActive: false }),
        getAgentProfileRelationField('noteTargets'),
      ]),
    ).toEqual(['ownerId']);
  });
});
