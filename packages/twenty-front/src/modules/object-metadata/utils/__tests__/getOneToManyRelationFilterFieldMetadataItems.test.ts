import { type ObjectPermissionsByObjectMetadataId } from '@/object-metadata/types/ObjectPermissionsByObjectMetadataId';
import { getOneToManyRelationFilterFieldMetadataItems } from '@/object-metadata/utils/getOneToManyRelationFilterFieldMetadataItems';
import {
  type ObjectRecordsPermissions,
  RelationType,
} from 'twenty-shared/types';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const objectMetadataItems = getTestEnrichedObjectMetadataItemsMock();

const companyObjectMetadataItem = objectMetadataItems.find(
  (objectMetadataItem) => objectMetadataItem.nameSingular === 'company',
)!;

const personObjectMetadataItem = objectMetadataItems.find(
  (objectMetadataItem) => objectMetadataItem.nameSingular === 'person',
)!;

const getCompanyField = (fieldName: string) =>
  companyObjectMetadataItem.readableFields.find(
    (fieldMetadataItem) => fieldMetadataItem.name === fieldName,
  )!;

const NO_RECORD_ACCESS: ObjectRecordsPermissions = {
  canCreateAllRecords: false,
  canReadAllRecords: false,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  unreadableFields: [],
  uneditableFields: [],
  rowLevelRecordsPermissions: null,
};

const getFieldNames = (
  objectPermissionsByObjectMetadataId: ObjectPermissionsByObjectMetadataId,
  readableFields = companyObjectMetadataItem.readableFields,
) =>
  getOneToManyRelationFilterFieldMetadataItems({
    objectMetadataItem: { readableFields },
    objectPermissionsByObjectMetadataId,
  }).map((fieldMetadataItem) => fieldMetadataItem.name);

describe('getOneToManyRelationFilterFieldMetadataItems', () => {
  it('returns only the one-to-many relations', () => {
    const fieldNames = getFieldNames({});

    expect(fieldNames).toEqual(
      expect.arrayContaining(['people', 'opportunities']),
    );
    expect(fieldNames).not.toContain('accountOwner');
    expect(fieldNames).not.toContain('name');
    expect(
      fieldNames.every(
        (fieldName) =>
          getCompanyField(fieldName).relation?.type ===
          RelationType.ONE_TO_MANY,
      ),
    ).toBe(true);
  });

  it('drops relations whose target object the role cannot read', () => {
    const fieldNames = getFieldNames({
      [personObjectMetadataItem.id]: NO_RECORD_ACCESS,
    });

    expect(fieldNames).not.toContain('people');
    expect(fieldNames).toContain('opportunities');
  });

  it('keeps relations whose target object is readable through a row-level rule', () => {
    const fieldNames = getFieldNames({
      [personObjectMetadataItem.id]: {
        ...NO_RECORD_ACCESS,
        rowLevelRecordsPermissions: [
          {
            ruleId: 'rule-id',
            canCreateRecords: false,
            canReadRecords: true,
            canUpdateRecords: false,
            canSoftDeleteRecords: false,
            canDestroyRecords: false,
            predicates: [],
            predicateGroups: [],
            unreadableFields: [],
            uneditableFields: [],
          },
        ],
      },
    });

    expect(fieldNames).toContain('people');
  });

  it('drops inactive relations and relations missing from the readable fields', () => {
    const readableFieldsWithInactivePeople =
      companyObjectMetadataItem.readableFields
        .filter(
          (fieldMetadataItem) => fieldMetadataItem.name !== 'opportunities',
        )
        .map((fieldMetadataItem) =>
          fieldMetadataItem.name === 'people'
            ? { ...fieldMetadataItem, isActive: false }
            : fieldMetadataItem,
        );

    const fieldNames = getFieldNames({}, readableFieldsWithInactivePeople);

    expect(fieldNames).not.toContain('people');
    expect(fieldNames).not.toContain('opportunities');
  });
});
