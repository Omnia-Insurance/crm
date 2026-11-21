import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type JunctionBridge } from '@/object-record/record-field/ui/utils/junction/detectJunctionBridge';
import { RecordFormFieldInputs } from '@/object-record/record-form/components/RecordFormFieldInputs';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { render } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const mockFormFieldInput = jest.fn((_: unknown) => null);
const mockDetectJunctionBridge = jest.fn();
const mockUseFindManyRecords = jest.fn();

jest.mock('@/object-record/record-field/ui/components/FormFieldInput', () => ({
  FormFieldInput: (props: unknown) => mockFormFieldInput(props),
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

const CARRIER_PRODUCT_BRIDGE: JunctionBridge = {
  junctionObjectNameSingular: 'carrierProduct',
  sourceJoinColumnName: 'carrierId',
  targetJoinColumnName: 'productId',
  parentFieldName: 'carrier',
};

// Standard mock metadata has no Policy, so a to-one relation stands in for Policy.product
const objectMetadataItem = getMockObjectMetadataItemOrThrow('opportunity');

const productFieldMetadataItem: FieldMetadataItem = {
  ...getMockFieldMetadataItemOrThrow({
    objectMetadataItem,
    fieldName: 'company',
  }),
  name: 'product',
  label: 'Product',
};

const nameFieldMetadataItem: FieldMetadataItem = {
  ...getMockFieldMetadataItemOrThrow({
    objectMetadataItem,
    fieldName: 'name',
  }),
  label: 'Name',
  settings: null,
};

const renderInputs = ({
  fieldMetadataItems,
  draftRecord,
}: {
  fieldMetadataItems: FieldMetadataItem[];
  draftRecord: Partial<ObjectRecord>;
}) =>
  render(
    <JotaiProvider store={createStore()}>
      <RecordFormFieldInputs
        objectMetadataItem={objectMetadataItem}
        fieldMetadataItems={fieldMetadataItems}
        draftRecord={draftRecord}
        onFieldValueChange={jest.fn()}
        onFieldValueClear={jest.fn()}
        formInstanceId="record-form"
      />
    </JotaiProvider>,
  );

const getLastFormFieldInputProps = (label: string) =>
  mockFormFieldInput.mock.calls
    .map(([props]) => props as { field: { label: string } })
    .filter((props) => props.field.label === label)
    .at(-1);

describe('RecordFormRelationToOneFieldInput', () => {
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
  });

  it('offers only the products of the carrier chosen in the draft', () => {
    renderInputs({
      fieldMetadataItems: [productFieldMetadataItem],
      draftRecord: { carrierId: 'carrier-1' },
    });

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'carrierProduct',
        filter: { carrierId: { eq: 'carrier-1' } },
        skip: false,
      }),
    );
    expect(getLastFormFieldInputProps('Product')).toEqual(
      expect.objectContaining({
        additionalFilter: { id: { in: ['product-1', 'product-2'] } },
      }),
    );
  });

  it('leaves the product picker unfiltered until a carrier is chosen', () => {
    renderInputs({
      fieldMetadataItems: [productFieldMetadataItem],
      draftRecord: {},
    });

    expect(getLastFormFieldInputProps('Product')).toEqual(
      expect.objectContaining({ additionalFilter: undefined }),
    );
  });

  it('does not load junction rows for fields that are not to-one relations', () => {
    renderInputs({
      fieldMetadataItems: [nameFieldMetadataItem],
      draftRecord: { carrierId: 'carrier-1' },
    });

    const nameFieldInputProps = getLastFormFieldInputProps('Name');

    expect(nameFieldInputProps).toBeDefined();
    expect(nameFieldInputProps).not.toHaveProperty('additionalFilter');
    expect(mockDetectJunctionBridge).not.toHaveBeenCalled();
    expect(mockUseFindManyRecords).not.toHaveBeenCalled();
  });
});
