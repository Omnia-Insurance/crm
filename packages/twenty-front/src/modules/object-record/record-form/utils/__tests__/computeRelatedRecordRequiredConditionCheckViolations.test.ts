import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type RelatedRecordRequiredConditionCheck } from '@/object-record/record-form/types/RelatedRecordRequiredConditionCheck';
import { computeRelatedRecordRequiredConditionCheckViolations } from '@/object-record/record-form/utils/computeRelatedRecordRequiredConditionCheckViolations';
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

const ALWAYS_REQUIRED: RequiredCondition = { type: 'always' };

const pointOfContactField = getField(opportunity, 'pointOfContact');
const personNameField = {
  ...getField(person, 'name'),
  requiredCondition: ALWAYS_REQUIRED,
};
const personCompanyField = {
  ...getField(person, 'company'),
  requiredCondition: ALWAYS_REQUIRED,
};

const RELATED_RECORD_REQUIRED_CONDITION_CHECK: RelatedRecordRequiredConditionCheck =
  {
    relationFieldMetadataItem: pointOfContactField,
    relatedObjectMetadataItem: person,
    relatedRecordId: 'person-id',
    evaluatedFieldMetadataItems: [personNameField, personCompanyField],
    recordGqlFields: { id: true, name: true, companyId: true },
  };

const pointOfContactLabelLowercase = pointOfContactField.label.toLowerCase();

describe('computeRelatedRecordRequiredConditionCheckViolations', () => {
  it('reports what the linked record misses on the whole record', () => {
    expect(
      computeRelatedRecordRequiredConditionCheckViolations({
        relatedRecordRequiredConditionCheck:
          RELATED_RECORD_REQUIRED_CONDITION_CHECK,
        relatedRecord: {
          __typename: 'Person',
          id: 'person-id',
          name: { firstName: '', lastName: '' },
          companyId: 'company-id',
        },
        canUpdateField: () => true,
      }),
    ).toEqual([
      {
        ruleId: `required-condition:${pointOfContactField.id}:${personNameField.id}`,
        fieldMetadataId: null,
        message: `${pointOfContactField.label}: ${personNameField.label} is required. Open the ${pointOfContactLabelLowercase} to complete it.`,
      },
    ]);
  });

  it('reads a relation of the linked record from its join column', () => {
    expect(
      computeRelatedRecordRequiredConditionCheckViolations({
        relatedRecordRequiredConditionCheck:
          RELATED_RECORD_REQUIRED_CONDITION_CHECK,
        relatedRecord: {
          __typename: 'Person',
          id: 'person-id',
          name: { firstName: 'Ada', lastName: 'Lovelace' },
          companyId: null,
        },
        canUpdateField: () => true,
      }),
    ).toEqual([
      expect.objectContaining({
        ruleId: `required-condition:${pointOfContactField.id}:${personCompanyField.id}`,
      }),
    ]);
  });

  it('explains a field of the linked record the user cannot edit', () => {
    expect(
      computeRelatedRecordRequiredConditionCheckViolations({
        relatedRecordRequiredConditionCheck:
          RELATED_RECORD_REQUIRED_CONDITION_CHECK,
        relatedRecord: {
          __typename: 'Person',
          id: 'person-id',
          name: { firstName: '', lastName: '' },
          companyId: 'company-id',
        },
        canUpdateField: () => false,
      }),
    ).toEqual([
      expect.objectContaining({
        message: `${pointOfContactField.label}: ${personNameField.label} is required, but you don't have permission to edit it. Ask an admin.`,
      }),
    ]);
  });
});
