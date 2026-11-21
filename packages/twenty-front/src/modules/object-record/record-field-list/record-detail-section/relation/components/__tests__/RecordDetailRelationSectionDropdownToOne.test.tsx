import { render } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { RecordFieldsScopeContextProvider } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { RecordDetailRelationSectionDropdownToOne } from '@/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToOne';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { type JunctionBridge } from '@/object-record/record-field/ui/utils/junction/detectJunctionBridge';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';

const mockSingleRecordPicker = jest.fn((_: unknown) => null);
const mockDetectJunctionBridge = jest.fn();
const mockUseFindManyRecords = jest.fn();
const mockUseFindOneRecord = jest.fn();

jest.mock(
  '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker',
  () => ({
    SingleRecordPicker: (props: unknown) => mockSingleRecordPicker(props),
  }),
);

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({ dropdownComponents }: { dropdownComponents: ReactNode }) => (
    <>{dropdownComponents}</>
  ),
}));

jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: jest.fn() }),
}));

jest.mock(
  '@/object-record/record-field/ui/utils/junction/detectJunctionBridge',
  () => ({
    detectJunctionBridge: (params: unknown) => mockDetectJunctionBridge(params),
  }),
);

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (params: unknown) => mockUseFindManyRecords(params),
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (params: unknown) => mockUseFindOneRecord(params),
}));

// A role that can create the target, as a manager can create Products
jest.mock(
  '@/object-record/record-field/ui/meta-types/input/hooks/useAddNewRecordAndOpenSidePanel',
  () => ({
    useAddNewRecordAndOpenSidePanel: () => ({
      createNewRecordAndOpenSidePanel: jest.fn(),
    }),
  }),
);

const CARRIER_PRODUCT_BRIDGE: JunctionBridge = {
  junctionObjectNameSingular: 'carrierProduct',
  sourceJoinColumnName: 'carrierId',
  targetJoinColumnName: 'productId',
  parentFieldName: 'carrier',
};

const RECORD_ID = 'policy-1';

// Standard mock metadata has no Policy, so Opportunity.company stands in for Policy.product
const objectMetadataItem = getMockObjectMetadataItemOrThrow('opportunity');

const productFieldDefinition = formatFieldMetadataItemAsFieldDefinition({
  field: getMockFieldMetadataItemOrThrow({
    objectMetadataItem,
    fieldName: 'company',
  }),
  objectMetadataItem,
});

const renderRelationCardPicker = (storedRecord: Partial<ObjectRecord>) => {
  const store = createStore();

  setTestObjectMetadataItemsInMetadataStore(
    store,
    getTestEnrichedObjectMetadataItemsMock(),
  );
  store.set(recordStoreFamilyState.atomFamily(RECORD_ID), {
    id: RECORD_ID,
    __typename: 'Opportunity',
    ...storedRecord,
  });

  return render(
    <JotaiProvider store={store}>
      <RecordFieldsScopeContextProvider
        value={{ scopeInstanceId: 'record-page' }}
      >
        <FieldContext.Provider
          value={{
            recordId: RECORD_ID,
            fieldDefinition: productFieldDefinition,
            isLabelIdentifier: false,
            isRecordFieldReadOnly: false,
          }}
        >
          <RecordDetailRelationSectionDropdownToOne
            dropdownTriggerClickableComponent={null}
          />
        </FieldContext.Provider>
      </RecordFieldsScopeContextProvider>
    </JotaiProvider>,
  );
};

const getLastPickerProps = () =>
  mockSingleRecordPicker.mock.calls.at(-1)?.[0] as
    | { additionalFilter?: unknown; onCreate?: unknown }
    | undefined;

describe('RecordDetailRelationSectionDropdownToOne', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDetectJunctionBridge.mockReturnValue(CARRIER_PRODUCT_BRIDGE);
    mockUseFindManyRecords.mockReturnValue({
      records: [{ id: 'carrier-product-1', productId: 'product-1' }],
      loading: false,
      error: undefined,
      pageInfo: { hasNextPage: false },
      fetchMoreRecords: jest.fn(),
      queryIdentifier: 'carrier-products-query',
    });
    mockUseFindOneRecord.mockReturnValue({
      record: undefined,
      loading: false,
      error: undefined,
    });
  });

  it('offers only the products of the carrier, without Add New', () => {
    renderRelationCardPicker({ carrierId: 'carrier-1' });

    expect(getLastPickerProps()).toEqual(
      expect.objectContaining({
        additionalFilter: { id: { in: ['product-1'] } },
        onCreate: undefined,
      }),
    );
  });

  it('keeps every product and Add New while the policy has no carrier', () => {
    renderRelationCardPicker({ carrier: null, carrierId: null });

    expect(getLastPickerProps()).toEqual(
      expect.objectContaining({
        additionalFilter: undefined,
        onCreate: expect.any(Function),
      }),
    );
  });
});
