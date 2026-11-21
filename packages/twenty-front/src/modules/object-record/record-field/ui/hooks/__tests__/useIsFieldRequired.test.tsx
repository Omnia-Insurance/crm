import { renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useIsFieldRequired } from '@/object-record/record-field/ui/hooks/useIsFieldRequired';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type RequiredCondition } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';

const RECORD_ID = 'opportunity-record-id';

const buildObjectMetadataItems = (
  requiredConditionsByFieldName: Record<string, RequiredCondition>,
): EnrichedObjectMetadataItem[] =>
  getTestEnrichedObjectMetadataItemsMock().map((objectMetadataItem) =>
    objectMetadataItem.nameSingular === 'opportunity'
      ? {
          ...objectMetadataItem,
          fields: objectMetadataItem.fields.map((field) => ({
            ...field,
            requiredCondition:
              requiredConditionsByFieldName[field.name] ?? null,
          })),
        }
      : objectMetadataItem,
  );

const getOpportunityOrThrow = (
  objectMetadataItems: EnrichedObjectMetadataItem[],
) => {
  const opportunity = objectMetadataItems.find(
    (objectMetadataItem) => objectMetadataItem.nameSingular === 'opportunity',
  );

  if (!isDefined(opportunity)) {
    throw new Error('Missing opportunity mock metadata');
  }

  return opportunity;
};

const renderIsFieldRequired = ({
  fieldName,
  requiredConditionsByFieldName,
  record,
}: {
  fieldName: string;
  requiredConditionsByFieldName: Record<string, RequiredCondition>;
  record: Partial<ObjectRecord> | null;
}) => {
  const objectMetadataItems = buildObjectMetadataItems(
    requiredConditionsByFieldName,
  );
  const opportunity = getOpportunityOrThrow(objectMetadataItems);
  const fieldMetadataItem = opportunity.fields.find(
    (field) => field.name === fieldName,
  );

  if (!isDefined(fieldMetadataItem)) {
    throw new Error(`Missing opportunity mock field ${fieldName}`);
  }

  const store = createStore();

  setTestObjectMetadataItemsInMetadataStore(store, objectMetadataItems);

  store.set(
    recordStoreFamilyState.atomFamily(RECORD_ID),
    isDefined(record)
      ? { id: RECORD_ID, __typename: 'Opportunity', ...record }
      : null,
  );

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <FieldContext.Provider
        value={{
          recordId: RECORD_ID,
          fieldDefinition: formatFieldMetadataItemAsFieldDefinition({
            field: fieldMetadataItem,
            objectMetadataItem: opportunity,
          }),
          isLabelIdentifier: false,
          isRecordFieldReadOnly: false,
        }}
      >
        {children}
      </FieldContext.Provider>
    </JotaiProvider>
  );

  return renderHook(() => useIsFieldRequired(), { wrapper: Wrapper }).result
    .current;
};

describe('useIsFieldRequired', () => {
  it('flags an empty field that is always required', () => {
    expect(
      renderIsFieldRequired({
        fieldName: 'name',
        requiredConditionsByFieldName: { name: { type: 'always' } },
        record: { name: '' },
      }),
    ).toBe(true);
  });

  it('stays off for a filled field', () => {
    expect(
      renderIsFieldRequired({
        fieldName: 'name',
        requiredConditionsByFieldName: { name: { type: 'always' } },
        record: { name: 'Renewal' },
      }),
    ).toBe(false);
  });

  it('stays off for a field without a rule', () => {
    expect(
      renderIsFieldRequired({
        fieldName: 'name',
        requiredConditionsByFieldName: {},
        record: { name: '' },
      }),
    ).toBe(false);
  });

  it('stays off until the record is loaded', () => {
    expect(
      renderIsFieldRequired({
        fieldName: 'name',
        requiredConditionsByFieldName: { name: { type: 'always' } },
        record: null,
      }),
    ).toBe(false);
  });

  it('follows the condition field of a conditional rule', () => {
    const amountField = getOpportunityOrThrow(
      getTestEnrichedObjectMetadataItemsMock(),
    ).fields.find((field) => field.name === 'amount');

    if (!isDefined(amountField)) {
      throw new Error('Missing opportunity mock field amount');
    }

    const requiredConditionsByFieldName: Record<string, RequiredCondition> = {
      closeDate: { type: 'fieldEmpty', fieldId: amountField.id },
    };

    expect(
      renderIsFieldRequired({
        fieldName: 'closeDate',
        requiredConditionsByFieldName,
        record: { closeDate: null, amount: null },
      }),
    ).toBe(true);
    expect(
      renderIsFieldRequired({
        fieldName: 'closeDate',
        requiredConditionsByFieldName,
        record: {
          closeDate: null,
          amount: { amountMicros: 1000000, currencyCode: 'USD' },
        },
      }),
    ).toBe(false);
  });
});
