import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getDefaultObjectPermissions } from '@/object-metadata/utils/getDefaultObjectPermissions';
import { getRelatedRecordRequiredConditionChecks } from '@/object-record/record-form/utils/getRelatedRecordRequiredConditionChecks';
import { type RequiredCondition } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const opportunity = getMockObjectMetadataItemOrThrow('opportunity');
const person = getMockObjectMetadataItemOrThrow('person');

const getField = (
  objectMetadataItem: EnrichedObjectMetadataItem,
  fieldName: string,
): FieldMetadataItem => {
  const field = objectMetadataItem.fields.find(
    (candidate) => candidate.name === fieldName,
  );

  if (!isDefined(field)) {
    throw new Error(`Missing mock field ${fieldName}`);
  }

  return field;
};

const withFieldOverrides = (
  objectMetadataItem: EnrichedObjectMetadataItem,
  fieldOverrides: Record<string, Partial<FieldMetadataItem>>,
): EnrichedObjectMetadataItem => ({
  ...objectMetadataItem,
  fields: objectMetadataItem.fields.map((field) =>
    isDefined(fieldOverrides[field.name])
      ? { ...field, ...fieldOverrides[field.name] }
      : field,
  ),
});

const ALWAYS_REQUIRED: RequiredCondition = { type: 'always' };

const pointOfContactField = getField(opportunity, 'pointOfContact');
const personNameField = getField(person, 'name');
const personJobTitleField = getField(person, 'jobTitle');

const personWithRequiredFields = withFieldOverrides(person, {
  name: { requiredCondition: ALWAYS_REQUIRED },
  city: {
    requiredCondition: {
      type: 'fieldNotEmpty',
      fieldId: personJobTitleField.id,
    },
  },
  company: { requiredCondition: ALWAYS_REQUIRED },
  pointOfContactForOpportunities: { requiredCondition: ALWAYS_REQUIRED },
});

const objectMetadataItems = [opportunity, personWithRequiredFields];

describe('getRelatedRecordRequiredConditionChecks', () => {
  it('loads a linked record with only the fields its required conditions read', () => {
    const [relatedRecordRequiredConditionCheck] =
      getRelatedRecordRequiredConditionChecks({
        draftRecord: { pointOfContactId: 'person-id' },
        objectMetadataItem: opportunity,
        objectMetadataItems,
        objectPermissionsByObjectMetadataId: {},
      });

    expect(relatedRecordRequiredConditionCheck).toEqual(
      expect.objectContaining({
        relationFieldMetadataItem: pointOfContactField,
        relatedObjectMetadataItem: personWithRequiredFields,
        relatedRecordId: 'person-id',
        recordGqlFields: {
          id: true,
          name: true,
          jobTitle: true,
          city: true,
          companyId: true,
        },
      }),
    );
  });

  it('skips relations the draft leaves empty', () => {
    expect(
      getRelatedRecordRequiredConditionChecks({
        draftRecord: { pointOfContactId: null },
        objectMetadataItem: opportunity,
        objectMetadataItems,
        objectPermissionsByObjectMetadataId: {},
      }),
    ).toEqual([]);
  });

  it('never requests a field the user cannot read', () => {
    const [relatedRecordRequiredConditionCheck] =
      getRelatedRecordRequiredConditionChecks({
        draftRecord: { pointOfContactId: 'person-id' },
        objectMetadataItem: opportunity,
        objectMetadataItems,
        objectPermissionsByObjectMetadataId: {
          [person.id]: {
            ...getDefaultObjectPermissions(),
            unreadableFields: [personNameField.id],
          },
        },
      });

    expect(
      relatedRecordRequiredConditionCheck.recordGqlFields,
    ).not.toHaveProperty('name');
  });

  it('skips a linked object the user cannot read at all', () => {
    expect(
      getRelatedRecordRequiredConditionChecks({
        draftRecord: { pointOfContactId: 'person-id' },
        objectMetadataItem: opportunity,
        objectMetadataItems,
        objectPermissionsByObjectMetadataId: {
          [person.id]: {
            ...getDefaultObjectPermissions(),
            canReadAllRecords: false,
          },
        },
      }),
    ).toEqual([]);
  });

  it('skips a linked object without required conditions', () => {
    expect(
      getRelatedRecordRequiredConditionChecks({
        draftRecord: { pointOfContactId: 'person-id' },
        objectMetadataItem: opportunity,
        objectMetadataItems: [opportunity, person],
        objectPermissionsByObjectMetadataId: {},
      }),
    ).toEqual([]);
  });
});
