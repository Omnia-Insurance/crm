import { createManyOperation } from 'test/integration/graphql/utils/create-many-operation.util';
import { search } from 'test/integration/graphql/utils/search.util';
import { createOneFieldMetadata } from 'test/integration/metadata/suites/field-metadata/utils/create-one-field-metadata.util';
import { createOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/create-one-object-metadata.util';
import { deleteOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/delete-one-object-metadata.util';
import { updateOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/update-one-object-metadata.util';
import { FieldMetadataType } from 'twenty-shared/types';

// Omnia keeps new searchable custom fields in the search surface by default, so
// policy numbers and application ids stay findable without a Settings change.
describe('Field metadata create - custom object search surface by default', () => {
  let testObjectMetadataId: string;

  const OBJECT_NAME_SINGULAR = 'searchVectorCreateFieldObject';
  const OBJECT_NAME_PLURAL = 'searchVectorCreateFieldObjects';
  const SEARCHABLE_FIELD_NAME = 'policyNumber';
  const RECORD_SEARCHABLE_VALUE = 'SearchDefaultPolicyToken33';
  const RECORD_NAME_VALUE = 'SearchDefaultNameToken44';

  beforeAll(async () => {
    const {
      data: {
        createOneObject: { id: objectMetadataId },
      },
    } = await createOneObjectMetadata({
      expectToFail: false,
      input: {
        nameSingular: OBJECT_NAME_SINGULAR,
        namePlural: OBJECT_NAME_PLURAL,
        labelSingular: 'Search Vector Create Field Object',
        labelPlural: 'Search Vector Create Field Objects',
        icon: 'IconSearch',
        isLabelSyncedWithName: false,
      },
    });

    testObjectMetadataId = objectMetadataId;
  });

  afterAll(async () => {
    await updateOneObjectMetadata({
      expectToFail: false,
      input: {
        idToUpdate: testObjectMetadataId,
        updatePayload: { isActive: false },
      },
    });
    await deleteOneObjectMetadata({
      expectToFail: false,
      input: { idToDelete: testObjectMetadataId },
    });
  });

  it('should make a new searchable custom field searchable without opting in', async () => {
    const {
      data: { createOneField },
    } = await createOneFieldMetadata({
      expectToFail: false,
      input: {
        name: SEARCHABLE_FIELD_NAME,
        label: 'Policy Number',
        type: FieldMetadataType.TEXT,
        objectMetadataId: testObjectMetadataId,
        isLabelSyncedWithName: false,
      },
      gqlFields: `id name isSearchable`,
    });

    expect(createOneField.isSearchable).toBe(true);

    const { data } = await createManyOperation({
      objectMetadataSingularName: OBJECT_NAME_SINGULAR,
      objectMetadataPluralName: OBJECT_NAME_PLURAL,
      gqlFields: `id name ${SEARCHABLE_FIELD_NAME}`,
      data: [
        {
          name: RECORD_NAME_VALUE,
          [SEARCHABLE_FIELD_NAME]: RECORD_SEARCHABLE_VALUE,
        },
      ],
      expectToFail: false,
    });

    const createdRecordId = data.createdRecords[0].id;

    const searchBySearchableField = await search({
      searchInput: RECORD_SEARCHABLE_VALUE,
      includedObjectNameSingulars: [OBJECT_NAME_SINGULAR],
      limit: 10,
      expectToFail: false,
    });

    expect(searchBySearchableField.data.search.edges.length).toBe(1);
    expect(searchBySearchableField.data.search.edges[0].node.recordId).toBe(
      createdRecordId,
    );
    expect(
      searchBySearchableField.data.search.edges[0].node.objectNameSingular,
    ).toBe(OBJECT_NAME_SINGULAR);

    const searchByName = await search({
      searchInput: RECORD_NAME_VALUE,
      includedObjectNameSingulars: [OBJECT_NAME_SINGULAR],
      limit: 10,
      expectToFail: false,
    });

    expect(searchByName.data.search.edges.length).toBe(1);
  });
});
