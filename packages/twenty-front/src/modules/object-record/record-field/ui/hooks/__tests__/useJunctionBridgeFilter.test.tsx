import { renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import {
  useJunctionBridgeFilter,
  useJunctionBridgeFilterForRecord,
} from '@/object-record/record-field/ui/hooks/useJunctionBridgeFilter';
import { type JunctionBridge } from '@/object-record/record-field/ui/utils/junction/detectJunctionBridge';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

const mockDetectJunctionBridge = jest.fn();
const mockUseFindManyRecords = jest.fn();
const mockUseFindOneRecord = jest.fn();

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

const SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

const CARRIER_PRODUCT_BRIDGE: JunctionBridge = {
  junctionObjectNameSingular: 'carrierProduct',
  sourceJoinColumnName: 'carrierId',
  targetJoinColumnName: 'productId',
  parentFieldName: 'carrier',
};

const policyObjectMetadataItem = {
  id: 'policy-object-id',
  nameSingular: 'policy',
  namePlural: 'policies',
  fields: [],
} as unknown as EnrichedObjectMetadataItem;

const productFieldMetadataItem = {
  id: 'policy-product-field-id',
  name: 'product',
} as unknown as FieldMetadataItem;

const mockJunctionRecords = ({
  records,
  loading = false,
}: {
  records: { id: string; productId: string }[];
  loading?: boolean;
}) =>
  mockUseFindManyRecords.mockReturnValue({
    records,
    loading,
    error: undefined,
    pageInfo: { hasNextPage: false },
    fetchMoreRecords: jest.fn(),
    queryIdentifier: 'carrier-products-query',
  });

const renderWithStore = <TResult,>(
  hook: () => TResult,
  store = createStore(),
) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  return renderHook(hook, { wrapper: Wrapper });
};

const renderForDraft = (draftRecord: Partial<ObjectRecord>) =>
  renderWithStore(() =>
    useJunctionBridgeFilterForRecord({
      objectMetadataItem: policyObjectMetadataItem,
      fieldMetadataItem: productFieldMetadataItem,
      objectMetadataItems: [policyObjectMetadataItem],
      record: draftRecord,
    }),
  );

describe('useJunctionBridgeFilterForRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDetectJunctionBridge.mockReturnValue(CARRIER_PRODUCT_BRIDGE);
    mockJunctionRecords({
      records: [
        { id: 'carrier-product-1', productId: 'product-1' },
        { id: 'carrier-product-2', productId: 'product-2' },
      ],
    });
  });

  it('offers only the products of the carrier chosen in a creation-form draft', () => {
    const { result } = renderForDraft({ carrierId: 'carrier-1' });

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'carrierProduct',
        filter: { carrierId: { eq: 'carrier-1' } },
        recordGqlFields: { id: true, productId: true },
        skip: false,
      }),
    );
    expect(result.current).toEqual({
      id: { in: ['product-1', 'product-2'] },
    });
  });

  it('reads the carrier from a loaded relation object too', () => {
    const { result } = renderForDraft({ carrier: { id: 'carrier-1' } });

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { carrierId: { eq: 'carrier-1' } },
        skip: false,
      }),
    );
    expect(result.current).toEqual({
      id: { in: ['product-1', 'product-2'] },
    });
  });

  it('offers no product while the carrier products load', () => {
    mockJunctionRecords({ records: [], loading: true });

    const { result } = renderForDraft({ carrierId: 'carrier-1' });

    expect(result.current).toEqual({ id: { eq: SENTINEL_ID } });
  });

  it('offers no product when the carrier sells none', () => {
    mockJunctionRecords({ records: [] });

    const { result } = renderForDraft({ carrierId: 'carrier-1' });

    expect(result.current).toEqual({ id: { eq: SENTINEL_ID } });
  });

  it('leaves the picker unfiltered until a carrier is chosen', () => {
    const { result } = renderForDraft({ carrierId: null });

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(result.current).toBeUndefined();
  });

  it('leaves fields without a junction bridge unfiltered', () => {
    mockDetectJunctionBridge.mockReturnValue(undefined);

    const { result } = renderForDraft({ carrierId: 'carrier-1' });

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({ objectNameSingular: 'policy', skip: true }),
    );
    expect(result.current).toBeUndefined();
  });
});

const renderForStoredRecord = (storedRecord: Partial<ObjectRecord>) => {
  const store = createStore();

  store.set(recordStoreFamilyState.atomFamily('policy-1'), {
    id: 'policy-1',
    __typename: 'Policy',
    ...storedRecord,
  });

  return renderWithStore(
    () =>
      useJunctionBridgeFilter({
        objectMetadataItem: policyObjectMetadataItem,
        fieldMetadataItem: productFieldMetadataItem,
        objectMetadataItems: [policyObjectMetadataItem],
        recordId: 'policy-1',
      }),
    store,
  );
};

const mockFetchedPolicy = ({
  record,
  loading = false,
  error,
}: {
  record?: Partial<ObjectRecord>;
  loading?: boolean;
  error?: Error;
}) => mockUseFindOneRecord.mockReturnValue({ record, loading, error });

describe('useJunctionBridgeFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDetectJunctionBridge.mockReturnValue(CARRIER_PRODUCT_BRIDGE);
    mockJunctionRecords({
      records: [{ id: 'carrier-product-1', productId: 'product-1' }],
    });
    mockFetchedPolicy({});
  });

  it('reads the carrier of a stored record', () => {
    const { result } = renderForStoredRecord({ carrier: { id: 'carrier-1' } });

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { carrierId: { eq: 'carrier-1' } },
        skip: false,
      }),
    );
    expect(mockUseFindOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(result.current).toEqual({ id: { in: ['product-1'] } });
  });

  it('fetches the carrier of a stored row that did not load it', () => {
    mockFetchedPolicy({
      record: { id: 'policy-1', __typename: 'Policy', carrierId: 'carrier-1' },
    });

    const { result } = renderForStoredRecord({ name: 'Row without carrier' });

    expect(mockUseFindOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'policy',
        objectRecordId: 'policy-1',
        recordGqlFields: { id: true, carrierId: true },
        skip: false,
      }),
    );
    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { carrierId: { eq: 'carrier-1' } },
        skip: false,
      }),
    );
    expect(result.current).toEqual({ id: { in: ['product-1'] } });
  });

  it('offers no product while that carrier loads', () => {
    mockFetchedPolicy({ loading: true });

    const { result } = renderForStoredRecord({ name: 'Row without carrier' });

    expect(result.current).toEqual({ id: { eq: SENTINEL_ID } });
  });

  it('offers no product when that carrier cannot be fetched', () => {
    mockFetchedPolicy({ error: new Error('Network error') });

    const { result } = renderForStoredRecord({ name: 'Row without carrier' });

    expect(result.current).toEqual({ id: { eq: SENTINEL_ID } });
  });

  it('leaves the picker unfiltered when the stored record has no carrier', () => {
    const { result } = renderForStoredRecord({
      carrier: null,
      carrierId: null,
    });

    expect(mockUseFindOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(result.current).toBeUndefined();
  });

  it('fetches nothing for fields without a junction bridge', () => {
    mockDetectJunctionBridge.mockReturnValue(undefined);

    const { result } = renderForStoredRecord({ name: 'Row without carrier' });

    expect(mockUseFindOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(result.current).toBeUndefined();
  });
});
