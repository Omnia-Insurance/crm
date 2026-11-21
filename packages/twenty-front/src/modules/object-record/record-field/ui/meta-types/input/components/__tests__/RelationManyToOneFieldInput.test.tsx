import { render } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { FieldInputEventContext } from '@/object-record/record-field/ui/contexts/FieldInputEventContext';
import { RelationManyToOneFieldInput } from '@/object-record/record-field/ui/meta-types/input/components/RelationManyToOneFieldInput';
import { RecordFieldComponentInstanceContext } from '@/object-record/record-field/ui/states/contexts/RecordFieldComponentInstanceContext';
import { recordFieldInputLayoutDirectionLoadingComponentState } from '@/object-record/record-field/ui/states/recordFieldInputLayoutDirectionLoadingComponentState';
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
const INSTANCE_ID = 'relation-to-one-field-input-policy-1-product';

// Standard mock metadata has no Policy, so Opportunity.company stands in for Policy.product
const objectMetadataItem = getMockObjectMetadataItemOrThrow('opportunity');

const productFieldDefinition = formatFieldMetadataItemAsFieldDefinition({
  field: getMockFieldMetadataItemOrThrow({
    objectMetadataItem,
    fieldName: 'company',
  }),
  objectMetadataItem,
});

const renderInput = (storedRecord: Partial<ObjectRecord>) => {
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
  store.set(
    recordFieldInputLayoutDirectionLoadingComponentState.atomFamily({
      instanceId: INSTANCE_ID,
    }),
    false,
  );

  return render(
    <JotaiProvider store={store}>
      <FieldContext.Provider
        value={{
          recordId: RECORD_ID,
          fieldDefinition: productFieldDefinition,
          isLabelIdentifier: false,
          isRecordFieldReadOnly: false,
        }}
      >
        <RecordFieldComponentInstanceContext.Provider
          value={{ instanceId: INSTANCE_ID }}
        >
          <FieldInputEventContext.Provider
            value={{ onSubmit: jest.fn(), onCancel: jest.fn() }}
          >
            <RelationManyToOneFieldInput />
          </FieldInputEventContext.Provider>
        </RecordFieldComponentInstanceContext.Provider>
      </FieldContext.Provider>
    </JotaiProvider>,
  );
};

const getLastPickerProps = () =>
  mockSingleRecordPicker.mock.calls.at(-1)?.[0] as
    | { additionalFilter?: unknown; onCreate?: unknown }
    | undefined;

describe('RelationManyToOneFieldInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDetectJunctionBridge.mockReturnValue(CARRIER_PRODUCT_BRIDGE);
    mockUseFindManyRecords.mockReturnValue({
      records: [
        { id: 'carrier-product-1', productId: 'product-1' },
        { id: 'carrier-product-2', productId: 'product-2' },
      ],
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
    renderInput({ carrierId: 'carrier-1' });

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'carrierProduct',
        filter: { carrierId: { eq: 'carrier-1' } },
        skip: false,
      }),
    );
    expect(mockUseFindOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(getLastPickerProps()).toEqual(
      expect.objectContaining({
        additionalFilter: { id: { in: ['product-1', 'product-2'] } },
        onCreate: undefined,
      }),
    );
  });

  it('loads the carrier of a table row that hides the carrier column', () => {
    mockUseFindOneRecord.mockReturnValue({
      record: {
        id: RECORD_ID,
        __typename: 'Opportunity',
        carrierId: 'carrier-1',
      },
      loading: false,
      error: undefined,
    });

    renderInput({ name: 'Policy row without its carrier' });

    expect(mockUseFindOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'opportunity',
        objectRecordId: RECORD_ID,
        recordGqlFields: { id: true, carrierId: true },
        skip: false,
      }),
    );
    expect(getLastPickerProps()).toEqual(
      expect.objectContaining({
        additionalFilter: { id: { in: ['product-1', 'product-2'] } },
        onCreate: undefined,
      }),
    );
  });

  it('keeps every product and Add New while the policy has no carrier', () => {
    renderInput({ carrier: null, carrierId: null });

    expect(mockUseFindOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(getLastPickerProps()).toEqual(
      expect.objectContaining({
        additionalFilter: undefined,
        onCreate: expect.any(Function),
      }),
    );
  });

  it('leaves relations without a junction bridge as upstream', () => {
    mockDetectJunctionBridge.mockReturnValue(undefined);

    renderInput({ carrierId: 'carrier-1' });

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(mockUseFindOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(getLastPickerProps()).toEqual(
      expect.objectContaining({
        additionalFilter: undefined,
        onCreate: expect.any(Function),
      }),
    );
  });
});
