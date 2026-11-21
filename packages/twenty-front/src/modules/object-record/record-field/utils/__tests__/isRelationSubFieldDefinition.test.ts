import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { isRelationSubFieldDefinition } from '@/object-record/record-field/utils/isRelationSubFieldDefinition';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const personMetadataItem = getMockObjectMetadataItemOrThrow('person');

const getPersonFieldDefinition = (fieldName: string) =>
  formatFieldMetadataItemAsFieldDefinition({
    field: getMockFieldMetadataItemOrThrow({
      objectMetadataItem: personMetadataItem,
      fieldName,
    }),
    objectMetadataItem: personMetadataItem,
  });

const companyRelationFieldDefinition = getPersonFieldDefinition('company');

const withSubFieldName = (subFieldName: string | null) => ({
  ...companyRelationFieldDefinition,
  metadata: { ...companyRelationFieldDefinition.metadata, subFieldName },
});

describe('isRelationSubFieldDefinition', () => {
  it('should be true for a relation sub-field definition', () => {
    expect(isRelationSubFieldDefinition(withSubFieldName('employees'))).toBe(
      true,
    );
  });

  it('should be false for a plain relation definition', () => {
    expect(isRelationSubFieldDefinition(companyRelationFieldDefinition)).toBe(
      false,
    );
  });

  it('should be false when the sub-field name is empty or null', () => {
    expect(isRelationSubFieldDefinition(withSubFieldName(''))).toBe(false);
    expect(isRelationSubFieldDefinition(withSubFieldName(null))).toBe(false);
  });

  it('should be false for a non-relation definition', () => {
    expect(isRelationSubFieldDefinition(getPersonFieldDefinition('city'))).toBe(
      false,
    );
  });
});
