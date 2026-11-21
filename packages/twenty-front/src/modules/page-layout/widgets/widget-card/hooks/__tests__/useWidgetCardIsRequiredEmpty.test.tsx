import { renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useWidgetCardIsRequiredEmpty } from '@/page-layout/widgets/widget-card/hooks/useWidgetCardIsRequiredEmpty';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { type TargetRecordIdentifier } from '@/ui/layout/contexts/TargetRecordIdentifier';
import { type RequiredCondition } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { PageLayoutType } from '~/generated-metadata/graphql';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';

const RECORD_ID = 'opportunity-record-id';

const TARGET_RECORD: TargetRecordIdentifier = {
  id: RECORD_ID,
  targetObjectNameSingular: 'opportunity',
};

const REQUIRED_CONDITIONS_BY_FIELD_NAME: Record<string, RequiredCondition> = {
  pointOfContact: { type: 'always' },
};

const objectMetadataItems: EnrichedObjectMetadataItem[] =
  getTestEnrichedObjectMetadataItemsMock().map((objectMetadataItem) => {
    if (objectMetadataItem.nameSingular !== 'opportunity') {
      return objectMetadataItem;
    }

    const amountField = objectMetadataItem.fields.find(
      (field) => field.name === 'amount',
    );

    const requiredConditionsByFieldName: Record<string, RequiredCondition> = {
      ...REQUIRED_CONDITIONS_BY_FIELD_NAME,
      ...(isDefined(amountField)
        ? { closeDate: { type: 'fieldNotEmpty', fieldId: amountField.id } }
        : {}),
    };

    return {
      ...objectMetadataItem,
      fields: objectMetadataItem.fields.map((field) => ({
        ...field,
        requiredCondition: requiredConditionsByFieldName[field.name] ?? null,
      })),
    };
  });

const opportunity = objectMetadataItems.find(
  (objectMetadataItem) => objectMetadataItem.nameSingular === 'opportunity',
);

const pointOfContactField = opportunity?.fields.find(
  (field) => field.name === 'pointOfContact',
);

if (!isDefined(opportunity) || !isDefined(pointOfContactField)) {
  throw new Error('Opportunity mock metadata is missing pointOfContact');
}

const renderIsRequiredEmpty = ({
  fieldMetadataIdOrName,
  record,
  hasTargetRecord = true,
}: {
  fieldMetadataIdOrName: string | undefined;
  record: Partial<ObjectRecord> | null;
  hasTargetRecord?: boolean;
}) => {
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
      <LayoutRenderingProvider
        value={{
          targetRecordIdentifier: hasTargetRecord ? TARGET_RECORD : undefined,
          layoutType: hasTargetRecord
            ? PageLayoutType.RECORD_PAGE
            : PageLayoutType.STANDALONE_PAGE,
        }}
      >
        {children}
      </LayoutRenderingProvider>
    </JotaiProvider>
  );

  return renderHook(() => useWidgetCardIsRequiredEmpty(fieldMetadataIdOrName), {
    wrapper: Wrapper,
  }).result.current;
};

describe('useWidgetCardIsRequiredEmpty', () => {
  it('stays off for widgets that show no field', () => {
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: undefined,
        record: { pointOfContact: null },
      }),
    ).toBe(false);
  });

  it('flags an empty required relation', () => {
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: pointOfContactField.id,
        record: { pointOfContact: null },
      }),
    ).toBe(true);
  });

  it('accepts a configuration that names the field', () => {
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: 'pointOfContact',
        record: { pointOfContact: null },
      }),
    ).toBe(true);
  });

  it('stays off once the relation is filled', () => {
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: pointOfContactField.id,
        record: { pointOfContact: { id: 'person-id' } },
      }),
    ).toBe(false);
  });

  it('stays off while the field is not part of the loaded record', () => {
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: pointOfContactField.id,
        record: {},
      }),
    ).toBe(false);
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: pointOfContactField.id,
        record: null,
      }),
    ).toBe(false);
  });

  it('stays off for a deleted record', () => {
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: pointOfContactField.id,
        record: {
          pointOfContact: null,
          deletedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ).toBe(false);
  });

  it('follows a conditional rule', () => {
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: 'closeDate',
        record: { closeDate: null, amount: null },
      }),
    ).toBe(false);
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: 'closeDate',
        record: {
          closeDate: null,
          amount: { amountMicros: 1000000, currencyCode: 'USD' },
        },
      }),
    ).toBe(true);
  });

  it('stays off on a page without a target record', () => {
    expect(
      renderIsRequiredEmpty({
        fieldMetadataIdOrName: pointOfContactField.id,
        record: { pointOfContact: null },
        hasTargetRecord: false,
      }),
    ).toBe(false);
  });
});
