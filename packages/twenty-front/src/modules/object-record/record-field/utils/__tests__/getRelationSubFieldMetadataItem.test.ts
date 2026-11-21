import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getRelationSubFieldMetadataItem } from '@/object-record/record-field/utils/getRelationSubFieldMetadataItem';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const companyMetadataItem = getMockObjectMetadataItemOrThrow('company');

const withCompanyReadableFields = (
  readableFields: FieldMetadataItem[],
): EnrichedObjectMetadataItem[] => [{ ...companyMetadataItem, readableFields }];

describe('getRelationSubFieldMetadataItem', () => {
  it('should return the readable active field of the relation target', () => {
    expect(
      getRelationSubFieldMetadataItem({
        targetObjectMetadataId: companyMetadataItem.id,
        subFieldName: 'employees',
        objectMetadataItems: [companyMetadataItem],
      })?.name,
    ).toBe('employees');
  });

  it.each([['unknown-object-id'], [''], [null], [undefined]])(
    'should return null when the relation target is %p',
    (targetObjectMetadataId) => {
      expect(
        getRelationSubFieldMetadataItem({
          targetObjectMetadataId,
          subFieldName: 'employees',
          objectMetadataItems: [companyMetadataItem],
        }),
      ).toBeNull();
    },
  );

  it('should return null when the relation target has no such field', () => {
    expect(
      getRelationSubFieldMetadataItem({
        targetObjectMetadataId: companyMetadataItem.id,
        subFieldName: 'notAField',
        objectMetadataItems: [companyMetadataItem],
      }),
    ).toBeNull();
  });

  it('should return null when the role cannot read the field', () => {
    const objectMetadataItems = withCompanyReadableFields(
      companyMetadataItem.readableFields.filter(
        (fieldMetadataItem) => fieldMetadataItem.name !== 'employees',
      ),
    );

    expect(
      companyMetadataItem.fields.some(
        (fieldMetadataItem) => fieldMetadataItem.name === 'employees',
      ),
    ).toBe(true);
    expect(
      getRelationSubFieldMetadataItem({
        targetObjectMetadataId: companyMetadataItem.id,
        subFieldName: 'employees',
        objectMetadataItems,
      }),
    ).toBeNull();
  });

  it('should return null when the field is inactive', () => {
    const objectMetadataItems = withCompanyReadableFields(
      companyMetadataItem.readableFields.map((fieldMetadataItem) =>
        fieldMetadataItem.name === 'employees'
          ? { ...fieldMetadataItem, isActive: false }
          : fieldMetadataItem,
      ),
    );

    expect(
      getRelationSubFieldMetadataItem({
        targetObjectMetadataId: companyMetadataItem.id,
        subFieldName: 'employees',
        objectMetadataItems,
      }),
    ).toBeNull();
  });

  it('should return null for a hidden system field', () => {
    expect(
      getRelationSubFieldMetadataItem({
        targetObjectMetadataId: companyMetadataItem.id,
        subFieldName: 'id',
        objectMetadataItems: [companyMetadataItem],
      }),
    ).toBeNull();
  });
});
