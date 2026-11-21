import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { computeDraftRequiredConditionViolations } from '@/object-record/record-form/utils/computeDraftRequiredConditionViolations';
import { type RequiredCondition } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const opportunity = getMockObjectMetadataItemOrThrow('opportunity');

const getField = (fieldName: string): FieldMetadataItem => {
  const field = opportunity.fields.find(
    (candidate) => candidate.name === fieldName,
  );

  if (!isDefined(field)) {
    throw new Error(`Missing mock field ${fieldName}`);
  }

  return field;
};

const withFieldOverrides = (
  fieldOverrides: Record<string, Partial<FieldMetadataItem>>,
  objectMetadataItem: EnrichedObjectMetadataItem = opportunity,
): EnrichedObjectMetadataItem => ({
  ...objectMetadataItem,
  fields: objectMetadataItem.fields.map((field) =>
    isDefined(fieldOverrides[field.name])
      ? { ...field, ...fieldOverrides[field.name] }
      : field,
  ),
});

const ALWAYS_REQUIRED: RequiredCondition = { type: 'always' };

const canUpdateEveryField = () => true;

const nameField = getField('name');
const amountField = getField('amount');
const closeDateField = getField('closeDate');
const ownerField = getField('owner');
const pointOfContactField = getField('pointOfContact');

describe('computeDraftRequiredConditionViolations', () => {
  it('reports an empty required field under that field', () => {
    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: {},
        objectMetadataItem: withFieldOverrides({
          name: { requiredCondition: ALWAYS_REQUIRED },
        }),
        canUpdateField: canUpdateEveryField,
      }),
    ).toEqual([
      {
        ruleId: `required-condition:${nameField.id}`,
        fieldMetadataId: nameField.id,
        message: `${nameField.label} is required`,
      },
    ]);
  });

  it('accepts a filled required field', () => {
    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: { name: 'Renewal' },
        objectMetadataItem: withFieldOverrides({
          name: { requiredCondition: ALWAYS_REQUIRED },
        }),
        canUpdateField: canUpdateEveryField,
      }),
    ).toEqual([]);
  });

  it('reads a many-to-one relation of the draft from its join column', () => {
    const objectMetadataItem = withFieldOverrides({
      pointOfContact: { requiredCondition: ALWAYS_REQUIRED },
    });

    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: { pointOfContactId: 'person-id' },
        objectMetadataItem,
        canUpdateField: canUpdateEveryField,
      }),
    ).toEqual([]);

    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: { pointOfContactId: null },
        objectMetadataItem,
        canUpdateField: canUpdateEveryField,
      }),
    ).toEqual([
      expect.objectContaining({ fieldMetadataId: pointOfContactField.id }),
    ]);
  });

  it('requires a field only while its condition holds', () => {
    const objectMetadataItem = withFieldOverrides({
      closeDate: {
        requiredCondition: { type: 'fieldNotEmpty', fieldId: amountField.id },
      },
    });

    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: {},
        objectMetadataItem,
        canUpdateField: canUpdateEveryField,
      }),
    ).toEqual([]);

    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: {
          amount: { amountMicros: 1000000000, currencyCode: 'USD' },
        },
        objectMetadataItem,
        canUpdateField: canUpdateEveryField,
      }),
    ).toEqual([
      expect.objectContaining({ fieldMetadataId: closeDateField.id }),
    ]);
  });

  it('counts a static default the server writes on insert as filled', () => {
    const objectMetadataItem = withFieldOverrides({
      stage: { requiredCondition: ALWAYS_REQUIRED },
    });

    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: {},
        objectMetadataItem,
        canUpdateField: canUpdateEveryField,
      }),
    ).toEqual([]);

    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: { stage: null },
        objectMetadataItem,
        canUpdateField: canUpdateEveryField,
      }),
    ).toHaveLength(1);
  });

  it('explains a required field the user cannot edit', () => {
    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: {},
        objectMetadataItem: withFieldOverrides({
          name: { requiredCondition: ALWAYS_REQUIRED },
        }),
        canUpdateField: () => false,
      }),
    ).toEqual([
      expect.objectContaining({
        fieldMetadataId: nameField.id,
        message: `${nameField.label} is required, but you don't have permission to edit it. Ask an admin.`,
      }),
    ]);
  });

  it('explains a required Agent the member cannot fill without a linked agent profile', () => {
    const objectMetadataItem = withFieldOverrides({
      owner: {
        requiredCondition: ALWAYS_REQUIRED,
        relation: isDefined(ownerField.relation)
          ? {
              ...ownerField.relation,
              targetObjectMetadata: {
                ...ownerField.relation.targetObjectMetadata,
                nameSingular: 'agentProfile',
              },
            }
          : null,
      },
    });

    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: {},
        objectMetadataItem,
        canUpdateField: (fieldMetadataId) => fieldMetadataId !== ownerField.id,
      }),
    ).toEqual([
      expect.objectContaining({
        fieldMetadataId: ownerField.id,
        message: `No agent profile is linked to your account, so ${ownerField.label} can't be filled in. Ask an admin to link one.`,
      }),
    ]);
  });

  it('never asks for the policy submitted date the server stamps on insert', () => {
    const policy: EnrichedObjectMetadataItem = {
      ...opportunity,
      nameSingular: 'policy',
      namePlural: 'policies',
      fields: [
        ...opportunity.fields,
        {
          ...closeDateField,
          id: 'submitted-date-field-id',
          name: 'submittedDate',
          label: 'Submitted Date',
          requiredCondition: ALWAYS_REQUIRED,
        },
      ],
    };

    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: {},
        objectMetadataItem: policy,
        canUpdateField: canUpdateEveryField,
      }),
    ).toEqual([]);
  });

  it('leaves fields the creation form cannot fill to the record page', () => {
    expect(
      computeDraftRequiredConditionViolations({
        draftRecord: {},
        objectMetadataItem: withFieldOverrides({
          attachments: { requiredCondition: ALWAYS_REQUIRED },
          name: { requiredCondition: ALWAYS_REQUIRED, isActive: false },
          closeDate: {
            requiredCondition: ALWAYS_REQUIRED,
            defaultValue: 'now',
          },
        }),
        canUpdateField: canUpdateEveryField,
      }),
    ).toEqual([]);
  });
});
