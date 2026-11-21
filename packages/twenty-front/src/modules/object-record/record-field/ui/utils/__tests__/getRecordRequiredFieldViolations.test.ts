import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getRecordRequiredFieldViolations } from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type RequiredCondition } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const getFieldOrThrow = (
  objectMetadataItem: EnrichedObjectMetadataItem,
  fieldName: string,
): FieldMetadataItem => {
  const fieldMetadataItem = objectMetadataItem.fields.find(
    (field) => field.name === fieldName,
  );

  if (!isDefined(fieldMetadataItem)) {
    throw new Error(`Missing mock field ${fieldName}`);
  }

  return fieldMetadataItem;
};

const withRequiredConditions = (
  objectMetadataItem: EnrichedObjectMetadataItem,
  requiredConditionsByFieldName: Record<string, RequiredCondition>,
): EnrichedObjectMetadataItem => ({
  ...objectMetadataItem,
  fields: objectMetadataItem.fields.map((field) => ({
    ...field,
    requiredCondition: requiredConditionsByFieldName[field.name] ?? null,
  })),
});

const buildRecord = (
  objectMetadataItem: EnrichedObjectMetadataItem,
  values: Record<string, unknown>,
): ObjectRecord => ({
  id: 'record-id',
  __typename: objectMetadataItem.nameSingular,
  deletedAt: null,
  ...values,
});

const ALWAYS: RequiredCondition = { type: 'always' };

const opportunity = getMockObjectMetadataItemOrThrow('opportunity');
const person = getMockObjectMetadataItemOrThrow('person');
const company = getMockObjectMetadataItemOrThrow('company');

const opportunityAmountField = getFieldOrThrow(opportunity, 'amount');
const opportunityCloseDateField = getFieldOrThrow(opportunity, 'closeDate');
const opportunityNameField = getFieldOrThrow(opportunity, 'name');
const opportunityPointOfContactField = getFieldOrThrow(
  opportunity,
  'pointOfContact',
);

describe('getRecordRequiredFieldViolations', () => {
  it('reports nothing for a missing or deleted record', () => {
    const objectMetadataItem = withRequiredConditions(opportunity, {
      name: ALWAYS,
    });

    expect(getRecordRequiredFieldViolations(null, objectMetadataItem)).toEqual(
      [],
    );
    expect(
      getRecordRequiredFieldViolations(
        buildRecord(opportunity, {
          name: null,
          deletedAt: '2026-01-01T00:00:00.000Z',
        }),
        objectMetadataItem,
      ),
    ).toEqual([]);
  });

  it('ignores fields without a required condition', () => {
    expect(
      getRecordRequiredFieldViolations(
        buildRecord(opportunity, { name: null }),
        withRequiredConditions(opportunity, {}),
      ),
    ).toEqual([]);
  });

  describe('always', () => {
    const objectMetadataItem = withRequiredConditions(opportunity, {
      name: ALWAYS,
    });

    it('reports an empty field with its label', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, { name: '' }),
          objectMetadataItem,
        ),
      ).toEqual([
        {
          fieldMetadataId: opportunityNameField.id,
          fieldLabel: opportunityNameField.label,
        },
      ]);
    });

    it('accepts a filled field', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, { name: 'Renewal' }),
          objectMetadataItem,
        ),
      ).toEqual([]);
    });

    it('reads an empty many-to-one relation as missing', () => {
      const relationRequired = withRequiredConditions(opportunity, {
        pointOfContact: ALWAYS,
      });

      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, { pointOfContact: null }),
          relationRequired,
        ),
      ).toEqual([
        expect.objectContaining({
          fieldMetadataId: opportunityPointOfContactField.id,
        }),
      ]);
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, { pointOfContact: { id: 'person-id' } }),
          relationRequired,
        ),
      ).toEqual([]);
    });

    it('reads an empty one-to-many relation as missing', () => {
      const relationRequired = withRequiredConditions(company, {
        people: ALWAYS,
      });

      expect(
        getRecordRequiredFieldViolations(
          buildRecord(company, { people: [] }),
          relationRequired,
        ),
      ).toHaveLength(1);
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(company, { people: [{ id: 'person-id' }] }),
          relationRequired,
        ),
      ).toEqual([]);
    });
  });

  describe('fieldEmpty', () => {
    const objectMetadataItem = withRequiredConditions(opportunity, {
      closeDate: { type: 'fieldEmpty', fieldId: opportunityAmountField.id },
    });

    it('requires the field while the condition field is empty', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, { closeDate: null, amount: null }),
          objectMetadataItem,
        ),
      ).toEqual([
        expect.objectContaining({
          fieldMetadataId: opportunityCloseDateField.id,
        }),
      ]);
    });

    it('releases the field once the condition field has a value', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, {
            closeDate: null,
            amount: { amountMicros: 1000000, currencyCode: 'USD' },
          }),
          objectMetadataItem,
        ),
      ).toEqual([]);
    });
  });

  describe('fieldNotEmpty', () => {
    const objectMetadataItem = withRequiredConditions(opportunity, {
      closeDate: { type: 'fieldNotEmpty', fieldId: opportunityAmountField.id },
    });

    it('requires the field while the condition field has a value', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, {
            closeDate: null,
            amount: { amountMicros: 1000000, currencyCode: 'USD' },
          }),
          objectMetadataItem,
        ),
      ).toEqual([
        expect.objectContaining({
          fieldMetadataId: opportunityCloseDateField.id,
        }),
      ]);
    });

    it('does not require the field while the condition field is empty', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, { closeDate: null, amount: null }),
          objectMetadataItem,
        ),
      ).toEqual([]);
    });

    it('accepts a filled field whatever the condition', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, {
            closeDate: '2026-01-01T00:00:00.000Z',
            amount: { amountMicros: 1000000, currencyCode: 'USD' },
          }),
          objectMetadataItem,
        ),
      ).toEqual([]);
    });
  });

  it('skips a conditional rule whose condition field no longer exists', () => {
    expect(
      getRecordRequiredFieldViolations(
        buildRecord(opportunity, { closeDate: null }),
        withRequiredConditions(opportunity, {
          closeDate: { type: 'fieldEmpty', fieldId: 'deleted-field-id' },
        }),
      ),
    ).toEqual([]);
  });

  it('never treats an unknown stored rule type as required', () => {
    const malformedRequiredCondition = {
      type: 'unknown',
      fieldId: opportunityAmountField.id,
    } as unknown as RequiredCondition;

    expect(
      getRecordRequiredFieldViolations(
        buildRecord(opportunity, {
          closeDate: null,
          amount: { amountMicros: 1000000, currencyCode: 'USD' },
        }),
        withRequiredConditions(opportunity, {
          closeDate: malformedRequiredCondition,
        }),
      ),
    ).toEqual([]);
  });

  describe('empty composite values', () => {
    it('treats a currency without an amount as empty', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(opportunity, {
            amount: { amountMicros: null, currencyCode: 'USD' },
          }),
          withRequiredConditions(opportunity, { amount: ALWAYS }),
        ),
      ).toHaveLength(1);
    });

    it('treats a full name with blank parts as empty', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(person, { name: { firstName: '', lastName: '' } }),
          withRequiredConditions(person, { name: ALWAYS }),
        ),
      ).toHaveLength(1);
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(person, { name: { firstName: 'Ada', lastName: '' } }),
          withRequiredConditions(person, { name: ALWAYS }),
        ),
      ).toEqual([]);
    });

    it('treats emails without a primary email as empty', () => {
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(person, {
            emails: { primaryEmail: '', additionalEmails: [] },
          }),
          withRequiredConditions(person, { emails: ALWAYS }),
        ),
      ).toHaveLength(1);
    });

    it('treats an address with only blank parts as empty', () => {
      const emptyAddress = {
        addressStreet1: '',
        addressStreet2: null,
        addressCity: '',
        addressState: null,
        addressPostcode: '',
        addressCountry: null,
        addressLat: null,
        addressLng: null,
      };

      expect(
        getRecordRequiredFieldViolations(
          buildRecord(company, { address: emptyAddress }),
          withRequiredConditions(company, { address: ALWAYS }),
        ),
      ).toHaveLength(1);
      expect(
        getRecordRequiredFieldViolations(
          buildRecord(company, {
            address: { ...emptyAddress, addressCity: 'Elberta' },
          }),
          withRequiredConditions(company, { address: ALWAYS }),
        ),
      ).toEqual([]);
    });
  });
});
