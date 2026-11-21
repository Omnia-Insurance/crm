import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getDefaultObjectPermissions } from '@/object-metadata/utils/getDefaultObjectPermissions';
import { getPermittedFields } from '@/object-metadata/utils/getPermittedFields';
import { mapObjectMetadataToGraphQLQuery } from '@/object-metadata/utils/mapObjectMetadataToGraphQLQuery';
import { generateDepthRecordGqlFieldsFromFields } from '@/object-record/graphql/record-gql-fields/utils/generateDepthRecordGqlFieldsFromFields';
import { mergeRelationSubFieldsIntoRecordGqlFields } from '@/object-record/graphql/record-gql-fields/utils/mergeRelationSubFieldsIntoRecordGqlFields';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { type FieldNode, Kind, parse, type SelectionSetNode } from 'graphql';

const objectMetadataItems = getTestEnrichedObjectMetadataItemsMock();
const personMetadata = getMockObjectMetadataItemOrThrow('person');
const companyMetadata = getMockObjectMetadataItemOrThrow('company');

const companyField = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: personMetadata,
  fieldName: 'company',
});

const fieldMetadataItemByFieldMetadataItemId: Record<
  string,
  FieldMetadataItem
> = Object.fromEntries(personMetadata.fields.map((field) => [field.id, field]));

const companySubFieldColumn = (
  subFieldName: string,
): Pick<RecordField, 'fieldMetadataItemId' | 'subFieldName'> => ({
  fieldMetadataItemId: companyField.id,
  subFieldName,
});

const getSelectedFieldNames = (
  selectionSet: SelectionSetNode | undefined,
): string[] =>
  (selectionSet?.selections ?? [])
    .filter(
      (selection): selection is FieldNode => selection.kind === Kind.FIELD,
    )
    .map((field) => field.name.value);

const findSelectedField = (
  selectionSet: SelectionSetNode | undefined,
  fieldName: string,
): FieldNode | undefined =>
  selectionSet?.selections.find(
    (selection): selection is FieldNode =>
      selection.kind === Kind.FIELD && selection.name.value === fieldName,
  );

const generatePersonRecordGqlFields = () =>
  generateDepthRecordGqlFieldsFromFields({
    objectMetadataItems,
    sourceObjectMetadataItem: personMetadata,
    fields: [companyField],
    depth: 1,
  });

describe('mergeRelationSubFieldsIntoRecordGqlFields', () => {
  it('adds a scalar sub-field inside its relation selection', () => {
    expect(
      mergeRelationSubFieldsIntoRecordGqlFields({
        recordGqlFields: generatePersonRecordGqlFields(),
        recordFields: [companySubFieldColumn('employees')],
        fieldMetadataItemByFieldMetadataItemId,
        objectMetadataItems,
      }),
    ).toEqual({
      company: { id: true, name: true, domainName: true, employees: true },
      companyId: true,
    });
  });

  it('selects the identifiers and join column of a many-to-one sub-field', () => {
    const { company } = mergeRelationSubFieldsIntoRecordGqlFields({
      recordGqlFields: generatePersonRecordGqlFields(),
      recordFields: [companySubFieldColumn('accountOwner')],
      fieldMetadataItemByFieldMetadataItemId,
      objectMetadataItems,
    });

    expect(company).toEqual({
      id: true,
      name: true,
      domainName: true,
      accountOwner: { id: true, name: true, avatarUrl: true },
      accountOwnerId: true,
    });
  });

  it('keeps a one-to-many sub-field as a full selection', () => {
    const { company } = mergeRelationSubFieldsIntoRecordGqlFields({
      recordGqlFields: generatePersonRecordGqlFields(),
      recordFields: [companySubFieldColumn('opportunities')],
      fieldMetadataItemByFieldMetadataItemId,
      objectMetadataItems,
    });

    expect(company).toHaveProperty('opportunities', true);
  });

  it('merges several sub-fields of the same relation', () => {
    const { company } = mergeRelationSubFieldsIntoRecordGqlFields({
      recordGqlFields: generatePersonRecordGqlFields(),
      recordFields: [
        companySubFieldColumn('employees'),
        companySubFieldColumn('address'),
      ],
      fieldMetadataItemByFieldMetadataItemId,
      objectMetadataItems,
    });

    expect(company).toMatchObject({ employees: true, address: true });
  });

  it('builds the relation selection when the relation column is not loaded', () => {
    expect(
      mergeRelationSubFieldsIntoRecordGqlFields({
        recordGqlFields: {},
        recordFields: [companySubFieldColumn('employees')],
        fieldMetadataItemByFieldMetadataItemId,
        objectMetadataItems,
      }),
    ).toEqual({
      company: { id: true, name: true, domainName: true, employees: true },
    });
  });

  it('skips a sub-field the role cannot read', () => {
    const employeesField = getMockFieldMetadataItemOrThrow({
      objectMetadataItem: companyMetadata,
      fieldName: 'employees',
    });

    const objectMetadataItemsWithUnreadableEmployees = objectMetadataItems.map(
      (objectMetadataItem) =>
        objectMetadataItem.id === companyMetadata.id
          ? {
              ...objectMetadataItem,
              ...getPermittedFields({
                fields: objectMetadataItem.fields,
                objectPermissions: {
                  unreadableFields: [employeesField.id],
                  uneditableFields: [],
                },
              }),
            }
          : objectMetadataItem,
    );

    const recordGqlFields = generatePersonRecordGqlFields();

    expect(
      mergeRelationSubFieldsIntoRecordGqlFields({
        recordGqlFields,
        recordFields: [companySubFieldColumn('employees')],
        fieldMetadataItemByFieldMetadataItemId,
        objectMetadataItems: objectMetadataItemsWithUnreadableEmployees,
      }),
    ).toEqual(recordGqlFields);
  });

  it('ignores plain columns, unknown fields, unknown sub-fields and one-to-many relations', () => {
    const pointOfContactForOpportunitiesField = getMockFieldMetadataItemOrThrow(
      {
        objectMetadataItem: personMetadata,
        fieldName: 'pointOfContactForOpportunities',
      },
    );

    const recordGqlFields = generatePersonRecordGqlFields();

    expect(
      mergeRelationSubFieldsIntoRecordGqlFields({
        recordGqlFields,
        recordFields: [
          { fieldMetadataItemId: companyField.id },
          { fieldMetadataItemId: companyField.id, subFieldName: null },
          { fieldMetadataItemId: 'unknown-field-id', subFieldName: 'name' },
          companySubFieldColumn('unknownSubField'),
          {
            fieldMetadataItemId: pointOfContactForOpportunitiesField.id,
            subFieldName: 'amount',
          },
        ],
        fieldMetadataItemByFieldMetadataItemId,
        objectMetadataItems,
      }),
    ).toEqual(recordGqlFields);
  });

  it('leaves a fully loaded relation untouched', () => {
    expect(
      mergeRelationSubFieldsIntoRecordGqlFields({
        recordGqlFields: { company: true, companyId: true },
        recordFields: [companySubFieldColumn('accountOwner')],
        fieldMetadataItemByFieldMetadataItemId,
        objectMetadataItems,
      }),
    ).toEqual({ company: true, companyId: true });
  });

  it('reaches the query builder, which drops sub-fields on objects the role cannot read', () => {
    const workspaceMemberMetadata =
      getMockObjectMetadataItemOrThrow('workspaceMember');

    const recordGqlFields = mergeRelationSubFieldsIntoRecordGqlFields({
      recordGqlFields: generatePersonRecordGqlFields(),
      recordFields: [
        companySubFieldColumn('employees'),
        companySubFieldColumn('accountOwner'),
      ],
      fieldMetadataItemByFieldMetadataItemId,
      objectMetadataItems,
    });

    const getCompanySelectionSet = (
      canReadWorkspaceMembers: boolean,
    ): SelectionSetNode | undefined => {
      const query = mapObjectMetadataToGraphQLQuery({
        objectMetadataItems,
        objectMetadataItem: personMetadata,
        recordGqlFields,
        objectPermissionsByObjectMetadataId: {
          [workspaceMemberMetadata.id]: {
            ...getDefaultObjectPermissions(),
            canReadAllRecords: canReadWorkspaceMembers,
          },
        },
      });

      const [operationDefinition] = parse(query).definitions;

      if (operationDefinition?.kind !== Kind.OPERATION_DEFINITION) {
        throw new Error('Expected an operation definition');
      }

      return findSelectedField(operationDefinition.selectionSet, 'company')
        ?.selectionSet;
    };

    const readableCompanySelectionSet = getCompanySelectionSet(true);

    expect(getSelectedFieldNames(readableCompanySelectionSet)).toEqual(
      expect.arrayContaining(['employees', 'accountOwner', 'accountOwnerId']),
    );
    expect(
      getSelectedFieldNames(
        findSelectedField(readableCompanySelectionSet, 'accountOwner')
          ?.selectionSet,
      ),
    ).toEqual(expect.arrayContaining(['id', 'name', 'avatarUrl']));

    const companyFieldNamesWithoutWorkspaceMembers = getSelectedFieldNames(
      getCompanySelectionSet(false),
    );

    expect(companyFieldNamesWithoutWorkspaceMembers).toContain('employees');
    expect(companyFieldNamesWithoutWorkspaceMembers).not.toContain(
      'accountOwner',
    );
    expect(companyFieldNamesWithoutWorkspaceMembers).not.toContain(
      'accountOwnerId',
    );
  });

  it('does not mutate the given selection', () => {
    const recordGqlFields = generatePersonRecordGqlFields();
    const recordGqlFieldsSnapshot = structuredClone(recordGqlFields);

    mergeRelationSubFieldsIntoRecordGqlFields({
      recordGqlFields,
      recordFields: [companySubFieldColumn('accountOwner')],
      fieldMetadataItemByFieldMetadataItemId,
      objectMetadataItems,
    });

    expect(recordGqlFields).toEqual(recordGqlFieldsSnapshot);
  });
});
