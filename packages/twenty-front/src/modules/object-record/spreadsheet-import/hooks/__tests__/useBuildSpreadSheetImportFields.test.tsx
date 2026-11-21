import { i18n } from '@lingui/core';
import { renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { useIcons } from 'twenty-ui/icon/provider';
import { JestObjectMetadataItemSetter } from '~/testing/jest/JestObjectMetadataItemSetter';

import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type FieldMetadataItemRelation } from '@/object-metadata/types/FieldMetadataItemRelation';
import { type IndexMetadataItem } from '@/object-metadata/types/IndexMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useBuildSpreadsheetImportFields } from '@/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields';
import { COMPOSITE_FIELD_SUB_FIELD_LABEL_MESSAGES } from '@/settings/data-model/constants/CompositeFieldSubFieldLabelMessages';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

const Wrapper = ({ children }: { children: ReactNode }) => {
  return (
    <JotaiProvider store={jotaiStore}>
      <JestObjectMetadataItemSetter>{children}</JestObjectMetadataItemSetter>
    </JotaiProvider>
  );
};

jest.mock('twenty-ui/icon/provider', () => ({
  useIcons: jest.fn(),
}));

describe('useBuildSpreadSheetImportFields', () => {
  const mockGetIcon = jest.fn().mockReturnValue('MockIcon');
  const mockUseIcons = useIcons as jest.MockedFunction<typeof useIcons>;

  beforeEach(() => {
    mockUseIcons.mockReturnValue({
      getIcon: mockGetIcon,
      getIcons: () => ({}),
    });
    jest.clearAllMocks();
    setTestObjectMetadataItemsInMetadataStore(jotaiStore, []);
  });

  const createMockFieldMetadataItem = (
    overrides: Partial<FieldMetadataItem> = {},
  ): FieldMetadataItem => ({
    id: 'test-field-id',
    universalIdentifier: 'test-field-id',
    name: 'testField',
    label: 'Test Field',
    type: FieldMetadataType.TEXT,
    icon: 'IconTest',
    isActive: true,
    isSystem: false,
    isNullable: true,
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
    ...overrides,
  });

  const createMockObjectMetadataItem = (
    overrides: Partial<EnrichedObjectMetadataItem> = {},
  ): EnrichedObjectMetadataItem =>
    ({
      id: 'test-object-id',
      universalIdentifier: 'test-object-id',
      nameSingular: 'testObject',
      namePlural: 'testObjects',
      labelSingular: 'Test Object',
      labelPlural: 'Test Objects',
      description: 'Test object description',
      icon: 'IconTest',
      isSystem: false,
      isActive: true,
      isLabelSyncedWithName: false,
      isRemote: false,
      isSearchable: true,
      createdAt: '2023-01-01',
      updatedAt: '2023-01-01',
      fields: [],
      ...overrides,
    }) as EnrichedObjectMetadataItem;

  it('should build importFields for basic field types', () => {
    const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
      wrapper: Wrapper,
    });

    const fieldMetadataItems: FieldMetadataItem[] = [
      createMockFieldMetadataItem({
        type: FieldMetadataType.TEXT,
        name: 'textField',
        label: 'Text Field',
      }),
      createMockFieldMetadataItem({
        type: FieldMetadataType.NUMBER,
        name: 'numberField',
        label: 'Number Field',
      }),
      createMockFieldMetadataItem({
        type: FieldMetadataType.BOOLEAN,
        name: 'booleanField',
        label: 'Boolean Field',
      }),
    ];

    const spreadsheetImportFields =
      result.current.buildSpreadsheetImportFields(fieldMetadataItems);

    expect(spreadsheetImportFields).toHaveLength(3);

    expect(spreadsheetImportFields[0]).toMatchObject({
      label: 'Text Field',
      key: 'textField',
      fieldType: { type: 'input' },
      fieldMetadataType: FieldMetadataType.TEXT,
      isNestedField: false,
    });

    expect(spreadsheetImportFields[1]).toMatchObject({
      label: 'Number Field',
      key: 'numberField',
      fieldType: { type: 'input' },
      fieldMetadataType: FieldMetadataType.NUMBER,
      isNestedField: false,
    });

    expect(spreadsheetImportFields[2]).toMatchObject({
      label: 'Boolean Field',
      key: 'booleanField',
      fieldType: { type: 'checkbox' },
      fieldMetadataType: FieldMetadataType.BOOLEAN,
      isNestedField: false,
    });
  });

  it('should build importFields for select types', () => {
    const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
      wrapper: Wrapper,
    });

    const fieldMetadataItems: FieldMetadataItem[] = [
      createMockFieldMetadataItem({
        type: FieldMetadataType.SELECT,
        name: 'selectField',
        label: 'Select Field',
        options: [
          {
            id: '1',
            label: 'Option 1',
            value: 'opt1',
            color: 'red',
            position: 0,
          },
          {
            id: '2',
            label: 'Option 2',
            value: 'opt2',
            color: 'blue',
            position: 1,
          },
        ],
      }),
      createMockFieldMetadataItem({
        type: FieldMetadataType.MULTI_SELECT,
        name: 'multiSelectField',
        label: 'Multi Select Field',
        options: [
          {
            id: '1',
            label: 'Tag 1',
            value: 'tag1',
            color: 'green',
            position: 0,
          },
          {
            id: '2',
            label: 'Tag 2',
            value: 'tag2',
            color: 'yellow',
            position: 1,
          },
        ],
      }),
    ];

    const spreadsheetImportFields =
      result.current.buildSpreadsheetImportFields(fieldMetadataItems);

    expect(spreadsheetImportFields).toHaveLength(2);

    expect(spreadsheetImportFields[0]).toMatchObject({
      label: 'Select Field',
      key: 'selectField',
      fieldType: {
        type: 'select',
        options: [
          { label: 'Option 1', value: 'opt1', color: 'red' },
          { label: 'Option 2', value: 'opt2', color: 'blue' },
        ],
      },
      fieldMetadataType: FieldMetadataType.SELECT,
    });

    expect(spreadsheetImportFields[1]).toMatchObject({
      label: 'Multi Select Field',
      key: 'multiSelectField',
      fieldType: {
        type: 'multiSelect',
        options: [
          { label: 'Tag 1', value: 'tag1', color: 'green' },
          { label: 'Tag 2', value: 'tag2', color: 'yellow' },
        ],
      },
      fieldMetadataType: FieldMetadataType.MULTI_SELECT,
    });
  });

  it('should build importFields for composite types (full name)', () => {
    const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
      wrapper: Wrapper,
    });

    const fieldMetadataItems: FieldMetadataItem[] = [
      createMockFieldMetadataItem({
        type: FieldMetadataType.FULL_NAME,
        name: 'fullName',
        label: 'Full Name',
      }),
    ];

    const spreadsheetImportFields =
      result.current.buildSpreadsheetImportFields(fieldMetadataItems);

    expect(spreadsheetImportFields.length).toBe(2);

    const firstNameField = spreadsheetImportFields.find((field) =>
      field.key.includes('First Name'),
    );
    const lastNameField = spreadsheetImportFields.find((field) =>
      field.key.includes('Last Name'),
    );

    expect(firstNameField).toBeDefined();
    expect(lastNameField).toBeDefined();

    expect(firstNameField?.isNestedField).toBe(true);
    expect(firstNameField?.isCompositeSubField).toBe(true);
    expect(lastNameField?.isNestedField).toBe(true);
    expect(lastNameField?.isCompositeSubField).toBe(true);
  });

  it('should keep the English label of a translated sub-field as an alternate match', () => {
    i18n.load('fr-FR', {
      [COMPOSITE_FIELD_SUB_FIELD_LABEL_MESSAGES[FieldMetadataType.FULL_NAME]
        .firstName.id]: 'Prénom',
    });
    i18n.activate('fr-FR');

    try {
      const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
        wrapper: Wrapper,
      });

      const spreadsheetImportFields =
        result.current.buildSpreadsheetImportFields([
          createMockFieldMetadataItem({
            type: FieldMetadataType.FULL_NAME,
            name: 'fullName',
            label: 'Full Name',
          }),
        ]);

      const firstNameField = spreadsheetImportFields.find(
        (field) => field.compositeSubFieldKey === 'firstName',
      );

      expect(firstNameField).toMatchObject({
        label: 'Full Name / Prénom',
        alternateMatches: ['Full Name / First Name'],
        key: 'First Name (fullName)',
      });
    } finally {
      i18n.activate(SOURCE_LOCALE);
    }
  });

  it('should not add alternate matches when the label is already English', () => {
    const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
      wrapper: Wrapper,
    });

    const spreadsheetImportFields = result.current.buildSpreadsheetImportFields(
      [
        createMockFieldMetadataItem({
          type: FieldMetadataType.FULL_NAME,
          name: 'fullName',
          label: 'Full Name',
        }),
      ],
    );

    expect(
      spreadsheetImportFields.every(
        (field) => field.alternateMatches === undefined,
      ),
    ).toBe(true);
  });

  it('should filter out ACTOR fields', () => {
    const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
      wrapper: Wrapper,
    });

    const fieldMetadataItems: FieldMetadataItem[] = [
      createMockFieldMetadataItem({
        type: FieldMetadataType.ACTOR,
        name: 'actorField',
        label: 'Actor Field',
      }),
      createMockFieldMetadataItem({
        type: FieldMetadataType.TEXT,
        name: 'textField',
        label: 'Text Field',
      }),
    ];

    const spreadsheetImportFields =
      result.current.buildSpreadsheetImportFields(fieldMetadataItems);

    expect(spreadsheetImportFields).toHaveLength(1);
    expect(spreadsheetImportFields[0].fieldMetadataType).toBe(
      FieldMetadataType.TEXT,
    );
  });

  it('should return empty array for unsupported field types', () => {
    const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
      wrapper: Wrapper,
    });

    const fieldMetadataItems: FieldMetadataItem[] = [
      createMockFieldMetadataItem({
        type: FieldMetadataType.POSITION,
        name: 'positionField',
        label: 'Position Field',
      }),
      createMockFieldMetadataItem({
        type: FieldMetadataType.TS_VECTOR,
        name: 'tsVectorField',
        label: 'TS Vector Field',
      }),
    ];

    const spreadsheetImportFields =
      result.current.buildSpreadsheetImportFields(fieldMetadataItems);

    expect(spreadsheetImportFields).toHaveLength(0);
  });

  it('should build importFields for relation field type', () => {
    const targetObjectMetadata = createMockObjectMetadataItem({
      id: 'target-object-id',
      nameSingular: 'company',
      namePlural: 'companies',
      labelSingular: 'Company',
      labelPlural: 'Companies',
      fields: [
        createMockFieldMetadataItem({
          id: 'company-id-field',
          name: 'id',
          label: 'ID',
          type: FieldMetadataType.UUID,
        }),
        createMockFieldMetadataItem({
          id: 'company-name-field',
          name: 'name',
          label: 'Name',
          type: FieldMetadataType.TEXT,
        }),
        createMockFieldMetadataItem({
          id: 'company-email-field',
          name: 'emails',
          label: 'Emails',
          type: FieldMetadataType.EMAILS,
        }),
      ],
      indexMetadatas: [
        {
          id: 'primary-key-index',
          name: 'primaryKeyIndex',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01',
          isUnique: true,
          indexFieldMetadatas: [
            {
              id: 'index-field-1',
              fieldMetadataId: 'company-id-field',
              createdAt: '2023-01-01',
              updatedAt: '2023-01-01',
              order: 0,
            },
          ],
        },
        {
          id: 'unique-name-index',
          name: 'uniqueNameIndex',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01',
          isUnique: true,
          indexFieldMetadatas: [
            {
              id: 'index-field-2',
              fieldMetadataId: 'company-name-field',
              createdAt: '2023-01-01',
              updatedAt: '2023-01-01',
              order: 0,
            },
          ],
        },
        {
          id: 'unique-email-index',
          name: 'uniqueEmailIndex',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01',
          isUnique: true,
          indexFieldMetadatas: [
            {
              id: 'index-field-3',
              fieldMetadataId: 'company-email-field',
              createdAt: '2023-01-01',
              updatedAt: '2023-01-01',
              order: 0,
            },
          ],
        },
      ] as IndexMetadataItem[],
    });

    const RelationTestWrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={jotaiStore}>
        <JestObjectMetadataItemSetter
          objectMetadataItems={[targetObjectMetadata]}
        >
          {children}
        </JestObjectMetadataItemSetter>
      </JotaiProvider>
    );

    const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
      wrapper: RelationTestWrapper,
    });

    const fieldMetadataItems: FieldMetadataItem[] = [
      createMockFieldMetadataItem({
        type: FieldMetadataType.RELATION,
        name: 'company',
        label: 'Company',
        relation: {
          type: RelationType.MANY_TO_ONE,
          targetObjectMetadata: {
            id: 'target-object-id',
            nameSingular: 'company',
            namePlural: 'companies',
          },
        } as any,
      }),
    ];

    const spreadsheetImportFields =
      result.current.buildSpreadsheetImportFields(fieldMetadataItems);

    // OMNIA-CUSTOM: plus the relation label field and a read-only "Additional Emails" field
    expect(spreadsheetImportFields).toHaveLength(6);

    const idField = spreadsheetImportFields.find((field) =>
      field.key.includes('id (company)'),
    );
    expect(idField).toBeDefined();
    expect(idField).toMatchObject({
      label: 'Company / ID',
      key: 'id (company)',
      fieldMetadataItemId: 'test-field-id',
      fieldMetadataType: FieldMetadataType.RELATION,
      isNestedField: true,
      isRelationConnectField: true,
      uniqueFieldMetadataItem: {
        id: 'company-id-field',
        name: 'id',
        type: FieldMetadataType.UUID,
      },
    });

    const nameField = spreadsheetImportFields.find((field) =>
      field.key.includes('name (company)'),
    );
    expect(nameField).toBeDefined();
    expect(nameField).toMatchObject({
      label: 'Company / Name',
      key: 'name (company)',
      fieldMetadataItemId: 'test-field-id',
      fieldMetadataType: FieldMetadataType.RELATION,
      isNestedField: true,
      isRelationConnectField: true,
      uniqueFieldMetadataItem: {
        id: 'company-name-field',
        name: 'name',
        type: FieldMetadataType.TEXT,
      },
    });

    const primaryEmailField = spreadsheetImportFields.find((field) =>
      field.key.includes('primaryEmail-emails (company)'),
    );
    expect(primaryEmailField).toBeDefined();
    expect(primaryEmailField).toMatchObject({
      isNestedField: true,
      isCompositeSubField: true,
      isRelationConnectField: true,
      compositeSubFieldKey: 'primaryEmail',
      uniqueFieldMetadataItem: {
        id: 'company-email-field',
        name: 'emails',
        type: FieldMetadataType.EMAILS,
      },
    });
  });

  // OMNIA-CUSTOM: relation label, update and read-only fields let an exported CSV re-import column for column
  describe('relation update fields', () => {
    const createMockRelation = ({
      type,
      targetObjectMetadataId,
    }: {
      type: RelationType;
      targetObjectMetadataId: string;
    }): FieldMetadataItemRelation => ({
      type,
      sourceFieldMetadata: { id: 'source-field-id', name: 'sourceField' },
      targetFieldMetadata: { id: 'target-field-id', name: 'targetField' },
      sourceObjectMetadata: {
        id: 'source-object-id',
        nameSingular: 'sourceObject',
        namePlural: 'sourceObjects',
      },
      targetObjectMetadata: {
        id: targetObjectMetadataId,
        nameSingular: 'targetObject',
        namePlural: 'targetObjects',
      },
    });

    const leadObjectMetadata = createMockObjectMetadataItem({
      id: 'lead-object-id',
      nameSingular: 'lead',
      namePlural: 'leads',
      labelSingular: 'Lead',
      labelPlural: 'Leads',
      fields: [
        createMockFieldMetadataItem({
          id: 'lead-id-field',
          name: 'id',
          label: 'Id',
          type: FieldMetadataType.UUID,
        }),
        createMockFieldMetadataItem({
          id: 'lead-date-of-birth-field',
          name: 'dateOfBirth',
          label: 'Date of Birth',
          type: FieldMetadataType.DATE,
        }),
        createMockFieldMetadataItem({
          id: 'lead-address-field',
          name: 'address',
          label: 'Address',
          type: FieldMetadataType.ADDRESS,
        }),
        createMockFieldMetadataItem({
          id: 'lead-lead-source-field',
          name: 'leadSource',
          label: 'Lead Source',
          type: FieldMetadataType.RELATION,
          relation: createMockRelation({
            type: RelationType.MANY_TO_ONE,
            targetObjectMetadataId: 'lead-source-object-id',
          }),
        }),
        createMockFieldMetadataItem({
          id: 'lead-family-members-field',
          name: 'familyMembers',
          label: 'Family Members',
          type: FieldMetadataType.RELATION,
          relation: createMockRelation({
            type: RelationType.ONE_TO_MANY,
            targetObjectMetadataId: 'family-member-object-id',
          }),
        }),
      ],
      indexMetadatas: [],
    });

    const leadRelationFieldMetadataItem = createMockFieldMetadataItem({
      id: 'policy-lead-field',
      name: 'lead',
      label: 'Lead',
      type: FieldMetadataType.RELATION,
      relation: createMockRelation({
        type: RelationType.MANY_TO_ONE,
        targetObjectMetadataId: 'lead-object-id',
      }),
    });

    const LeadRelationTestWrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={jotaiStore}>
        <JestObjectMetadataItemSetter
          objectMetadataItems={[leadObjectMetadata]}
        >
          {children}
        </JestObjectMetadataItemSetter>
      </JotaiProvider>
    );

    it('should build the relation label, id connect, update and read-only fields in order', () => {
      const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
        wrapper: LeadRelationTestWrapper,
      });

      const spreadsheetImportFields =
        result.current.buildSpreadsheetImportFields([
          leadRelationFieldMetadataItem,
        ]);

      expect(spreadsheetImportFields.map((field) => field.key)).toEqual([
        '__relationLabel:lead',
        'id (lead)',
        'update:addressStreet1-address (lead)',
        'update:addressStreet2-address (lead)',
        'update:addressCity-address (lead)',
        'update:addressState-address (lead)',
        'update:addressCountry-address (lead)',
        'update:addressPostcode-address (lead)',
        'update:dateOfBirth (lead)',
        '__readOnly:lead.leadSource',
        '__readOnly:lead.familyMembers',
        '__readOnly:lead.address.addressLat',
        '__readOnly:lead.address.addressLng',
      ]);

      expect(
        spreadsheetImportFields.every(
          (field) =>
            field.fieldMetadataItemId === leadRelationFieldMetadataItem.id,
        ),
      ).toBe(true);
    });

    it('should match the export relation label column with a relation label field', () => {
      const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
        wrapper: LeadRelationTestWrapper,
      });

      const relationLabelField = result.current
        .buildSpreadsheetImportFields([leadRelationFieldMetadataItem])
        .find((field) => field.key === '__relationLabel:lead');

      expect(relationLabelField).toMatchObject({
        label: 'Lead',
        fieldMetadataType: FieldMetadataType.RELATION,
        isNestedField: false,
        fieldValidationDefinitions: [],
      });
      expect(relationLabelField?.isRelationConnectField).toBeUndefined();
    });

    it('should map the upstream "<Relation> Id" export header to the id connect field', () => {
      const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
        wrapper: LeadRelationTestWrapper,
      });

      const idConnectField = result.current
        .buildSpreadsheetImportFields([leadRelationFieldMetadataItem])
        .find((field) => field.key === 'id (lead)');

      expect(idConnectField).toMatchObject({
        label: 'Lead / Id',
        alternateMatches: ['Lead Id'],
        isRelationConnectField: true,
        uniqueFieldMetadataItem: { id: 'lead-id-field', name: 'id' },
      });
    });

    it('should build update fields for scalar and composite fields of the related record', () => {
      const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
        wrapper: LeadRelationTestWrapper,
      });

      const spreadsheetImportFields =
        result.current.buildSpreadsheetImportFields([
          leadRelationFieldMetadataItem,
        ]);

      expect(
        spreadsheetImportFields.find(
          (field) => field.key === 'update:dateOfBirth (lead)',
        ),
      ).toMatchObject({
        label: 'Lead / Date of Birth',
        isNestedField: true,
        isRelationUpdateField: true,
        targetFieldMetadataItem: { id: 'lead-date-of-birth-field' },
      });

      expect(
        spreadsheetImportFields.find(
          (field) => field.key === 'update:addressCity-address (lead)',
        ),
      ).toMatchObject({
        label: 'Lead / Address / City',
        isNestedField: true,
        isCompositeSubField: true,
        compositeSubFieldKey: 'addressCity',
        isRelationUpdateField: true,
        targetFieldMetadataItem: { id: 'lead-address-field' },
      });

      expect(
        spreadsheetImportFields.some(
          (field) =>
            field.isRelationUpdateField === true &&
            field.isRelationConnectField === true,
        ),
      ).toBe(false);
    });

    it('should add read-only fields for exported columns the import must not change', () => {
      const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
        wrapper: LeadRelationTestWrapper,
      });

      const readOnlyFields = result.current
        .buildSpreadsheetImportFields([leadRelationFieldMetadataItem])
        .filter((field) => field.isReadOnly === true);

      expect(readOnlyFields.map((field) => field.label)).toEqual([
        'Lead / Lead Source',
        'Lead / Family Members',
        'Lead / Address / Latitude',
        'Lead / Address / Longitude',
      ]);

      for (const readOnlyField of readOnlyFields) {
        expect(readOnlyField).toMatchObject({
          description: 'Read-only — exported for reference',
          fieldValidationDefinitions: [],
          isNestedField: true,
        });
        expect(readOnlyField.key.startsWith('__readOnly:lead.')).toBe(true);
        expect(readOnlyField.isRelationUpdateField).toBeUndefined();
      }
    });

    it('should keep the English export header of a translated sub-field as an alternate match', () => {
      i18n.load('fr-FR', {
        [COMPOSITE_FIELD_SUB_FIELD_LABEL_MESSAGES[FieldMetadataType.ADDRESS]
          .addressCity.id]: 'Ville',
      });
      i18n.activate('fr-FR');

      try {
        const { result } = renderHook(() => useBuildSpreadsheetImportFields(), {
          wrapper: LeadRelationTestWrapper,
        });

        const cityUpdateField = result.current
          .buildSpreadsheetImportFields([leadRelationFieldMetadataItem])
          .find((field) => field.key === 'update:addressCity-address (lead)');

        expect(cityUpdateField).toMatchObject({
          label: 'Lead / Address / Ville',
          alternateMatches: ['Lead / Address / City'],
        });
      } finally {
        i18n.activate(SOURCE_LOCALE);
      }
    });
  });
});
