import { renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useSingleRecordPickerPerformSearch } from '@/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerPerformSearch';
import { SingleRecordPickerComponentInstanceContext } from '@/object-record/record-picker/single-record-picker/states/contexts/SingleRecordPickerComponentInstanceContext';

const mockUseObjectRecordSearchRecords = jest.fn();

const mockProductObjectMetadataItem = {
  id: 'product-object-metadata-id',
  nameSingular: 'product',
  namePlural: 'products',
} as EnrichedObjectMetadataItem;

jest.mock('@/object-record/hooks/useObjectRecordSearchRecords', () => ({
  useObjectRecordSearchRecords: (params: unknown) =>
    mockUseObjectRecordSearchRecords(params),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [mockProductObjectMetadataItem],
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({ objectPermissionsByObjectMetadataId: {} }),
}));

const PRODUCT_ALLOWLIST = { id: { in: ['product-1', 'product-2'] } };

const Wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider store={createStore()}>
    <SingleRecordPickerComponentInstanceContext.Provider
      value={{ instanceId: 'policy-product-picker' }}
    >
      {children}
    </SingleRecordPickerComponentInstanceContext.Provider>
  </JotaiProvider>
);

// Each render runs three searches: selected, selected matching the input, to select
const getLastRenderSearchFilters = () =>
  mockUseObjectRecordSearchRecords.mock.calls
    .slice(-3)
    .map(([{ filter }]) => filter);

describe('useSingleRecordPickerPerformSearch', () => {
  beforeEach(() => {
    mockUseObjectRecordSearchRecords.mockReset();
    mockUseObjectRecordSearchRecords.mockReturnValue({
      loading: false,
      searchRecords: [],
      error: undefined,
    });
  });

  it('narrows only the records to select, so the current value stays listed', () => {
    renderHook(
      () =>
        useSingleRecordPickerPerformSearch({
          selectedIds: ['product-1'],
          objectNameSingulars: ['product'],
          additionalFilter: PRODUCT_ALLOWLIST,
        }),
      { wrapper: Wrapper },
    );

    expect(getLastRenderSearchFilters()).toEqual([
      { id: { in: ['product-1'] } },
      { id: { in: ['product-1'] } },
      { and: [{ not: { id: { in: ['product-1'] } } }, PRODUCT_ALLOWLIST] },
    ]);
  });

  it('keeps the upstream filters when there is no additional filter', () => {
    renderHook(
      () =>
        useSingleRecordPickerPerformSearch({
          selectedIds: [],
          objectNameSingulars: ['product'],
        }),
      { wrapper: Wrapper },
    );

    expect(getLastRenderSearchFilters()).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
