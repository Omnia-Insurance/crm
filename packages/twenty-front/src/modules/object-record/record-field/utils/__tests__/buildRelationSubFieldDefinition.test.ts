import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { buildRelationSubFieldDefinition } from '@/object-record/record-field/utils/buildRelationSubFieldDefinition';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const objectMetadataItems = getTestEnrichedObjectMetadataItemsMock();
const personMetadataItem = getMockObjectMetadataItemOrThrow('person');
const companyMetadataItem = getMockObjectMetadataItemOrThrow('company');

const companyRelationFieldDefinition = formatFieldMetadataItemAsFieldDefinition(
  {
    field: getMockFieldMetadataItemOrThrow({
      objectMetadataItem: personMetadataItem,
      fieldName: 'company',
    }),
    objectMetadataItem: personMetadataItem,
  },
) as FieldDefinition<FieldRelationMetadata>;

const cityFieldDefinition = formatFieldMetadataItemAsFieldDefinition({
  field: getMockFieldMetadataItemOrThrow({
    objectMetadataItem: personMetadataItem,
    fieldName: 'city',
  }),
  objectMetadataItem: personMetadataItem,
});

const idealCustomerProfileFieldMetadataItem = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: companyMetadataItem,
  fieldName: 'idealCustomerProfile',
});

describe('buildRelationSubFieldDefinition', () => {
  it('should build a read-only definition typed as the sub-field', () => {
    const subFieldDefinition = buildRelationSubFieldDefinition({
      relationFieldDefinition: companyRelationFieldDefinition,
      subFieldName: 'idealCustomerProfile',
      objectMetadataItems,
    });

    expect(subFieldDefinition).toMatchObject({
      fieldMetadataId: `${companyRelationFieldDefinition.fieldMetadataId}.idealCustomerProfile`,
      label: `${companyRelationFieldDefinition.label} / ${idealCustomerProfileFieldMetadataItem.label}`,
      type: idealCustomerProfileFieldMetadataItem.type,
      iconName: idealCustomerProfileFieldMetadataItem.icon,
      defaultValue: idealCustomerProfileFieldMetadataItem.defaultValue,
      isUIEditable: false,
      requiredCondition: null,
      metadata: {
        fieldName: 'company',
        relationObjectMetadataId: companyMetadataItem.id,
        relationObjectMetadataNameSingular: companyMetadataItem.nameSingular,
        relationObjectMetadataNamePlural: companyMetadataItem.namePlural,
        objectMetadataNameSingular: personMetadataItem.nameSingular,
        description: idealCustomerProfileFieldMetadataItem.description,
        isUIEditable: false,
        subFieldName: 'idealCustomerProfile',
      },
    });
    expect(subFieldDefinition?.editButtonIcon).toBeUndefined();
  });

  it('should return null when the definition is not a relation', () => {
    expect(
      buildRelationSubFieldDefinition({
        relationFieldDefinition: cityFieldDefinition,
        subFieldName: 'idealCustomerProfile',
        objectMetadataItems,
      }),
    ).toBeNull();
  });

  it('should return null when the relation target is unknown', () => {
    const relationFieldDefinitionToUnknownObject = {
      ...companyRelationFieldDefinition,
      metadata: {
        ...companyRelationFieldDefinition.metadata,
        relationObjectMetadataId: 'unknown-object-id',
      },
    };

    expect(
      buildRelationSubFieldDefinition({
        relationFieldDefinition: relationFieldDefinitionToUnknownObject,
        subFieldName: 'idealCustomerProfile',
        objectMetadataItems,
      }),
    ).toBeNull();
  });

  it('should return null when the sub-field is missing', () => {
    expect(
      buildRelationSubFieldDefinition({
        relationFieldDefinition: companyRelationFieldDefinition,
        subFieldName: 'notAField',
        objectMetadataItems,
      }),
    ).toBeNull();
  });

  it('should return null when the role cannot read the sub-field', () => {
    const objectMetadataItemsWithUnreadableSubField = objectMetadataItems.map(
      (objectMetadataItem) =>
        objectMetadataItem.id === companyMetadataItem.id
          ? {
              ...objectMetadataItem,
              readableFields: objectMetadataItem.readableFields.filter(
                (fieldMetadataItem) =>
                  fieldMetadataItem.name !== 'idealCustomerProfile',
              ),
            }
          : objectMetadataItem,
    );

    expect(
      buildRelationSubFieldDefinition({
        relationFieldDefinition: companyRelationFieldDefinition,
        subFieldName: 'idealCustomerProfile',
        objectMetadataItems: objectMetadataItemsWithUnreadableSubField,
      }),
    ).toBeNull();
  });
});
