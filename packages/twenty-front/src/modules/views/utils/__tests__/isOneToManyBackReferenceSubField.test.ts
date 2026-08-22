import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isOneToManyBackReferenceSubField } from '@/views/utils/isOneToManyBackReferenceSubField';
import { FieldMetadataType } from 'twenty-shared/types';
import { RelationType } from '~/generated-metadata/graphql';

const relationSubField = (
  relationType: RelationType,
  targetNameSingular: string,
): Pick<FieldMetadataItem, 'type' | 'relation'> => ({
  type: FieldMetadataType.RELATION,
  relation: {
    type: relationType,
    targetObjectMetadata: { nameSingular: targetNameSingular },
  } as FieldMetadataItem['relation'],
});

describe('isOneToManyBackReferenceSubField', () => {
  it('flags product.policies as a back-reference on the policy table', () => {
    expect(
      isOneToManyBackReferenceSubField({
        subFieldMetadataItem: relationSubField(
          RelationType.ONE_TO_MANY,
          'policy',
        ),
        baseObjectNameSingular: 'policy',
      }),
    ).toBe(true);
  });

  it('keeps ONE_TO_MANY sub-fields that target another object (lead.familyMembers)', () => {
    expect(
      isOneToManyBackReferenceSubField({
        subFieldMetadataItem: relationSubField(
          RelationType.ONE_TO_MANY,
          'familyMember',
        ),
        baseObjectNameSingular: 'policy',
      }),
    ).toBe(false);
  });

  it('keeps MANY_TO_ONE sub-fields even when they target the base object', () => {
    expect(
      isOneToManyBackReferenceSubField({
        subFieldMetadataItem: relationSubField(
          RelationType.MANY_TO_ONE,
          'policy',
        ),
        baseObjectNameSingular: 'policy',
      }),
    ).toBe(false);
  });

  it('ignores non-relation sub-fields', () => {
    expect(
      isOneToManyBackReferenceSubField({
        subFieldMetadataItem: { type: FieldMetadataType.TEXT, relation: null },
        baseObjectNameSingular: 'policy',
      }),
    ).toBe(false);
  });
});
