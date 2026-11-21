import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useMultipleRecordPickerPerformSearch } from '@/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch';
import { multipleRecordPickerSearchableObjectMetadataItemsComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerSearchableObjectMetadataItemsComponentState';

const mockSearchQuery = jest.fn();

const mockPolicyObjectMetadataItem = {
  id: 'policy-object-metadata-id',
  nameSingular: 'policy',
  namePlural: 'policies',
} as EnrichedObjectMetadataItem;

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ query: mockSearchQuery }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [mockPolicyObjectMetadataItem],
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({ objectPermissionsByObjectMetadataId: {} }),
}));

jest.mock(
  '@/object-record/multiple-objects/hooks/usePerformCombinedFindManyRecords',
  () => ({
    usePerformCombinedFindManyRecords: () => ({
      performCombinedFindManyRecords: jest.fn(),
    }),
  }),
);

const PICKER_INSTANCE_ID = 'lead-policies-picker';
const POLICY_ALLOWLIST = { id: { in: ['policy-1', 'policy-2'] } };

const renderPerformSearch = () => {
  const store = createStore();

  // Openers store the searchable objects that later searches (typing) reuse
  store.set(
    multipleRecordPickerSearchableObjectMetadataItemsComponentState.atomFamily({
      instanceId: PICKER_INSTANCE_ID,
    }),
    [mockPolicyObjectMetadataItem],
  );

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  const { result } = renderHook(() => useMultipleRecordPickerPerformSearch(), {
    wrapper: Wrapper,
  });

  return result.current.performSearch;
};

const getSearchVariables = () =>
  mockSearchQuery.mock.calls.map(([{ variables }]) => variables);

describe('useMultipleRecordPickerPerformSearch', () => {
  beforeEach(() => {
    mockSearchQuery.mockReset();
    mockSearchQuery.mockResolvedValue({
      data: {
        search: {
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
  });

  it('searches without a filter when nothing is picked or narrowed', async () => {
    const performSearch = renderPerformSearch();

    await act(() =>
      performSearch({
        multipleRecordPickerInstanceId: PICKER_INSTANCE_ID,
        forceSearchableObjectMetadataItems: [mockPolicyObjectMetadataItem],
      }),
    );

    expect(getSearchVariables()).toEqual([
      expect.objectContaining({ filter: undefined }),
    ]);
  });

  it('narrows both the picked and the unpicked records search', async () => {
    const performSearch = renderPerformSearch();

    await act(() =>
      performSearch({
        multipleRecordPickerInstanceId: PICKER_INSTANCE_ID,
        forceSearchableObjectMetadataItems: [mockPolicyObjectMetadataItem],
        forcePickableMorphItems: [
          {
            recordId: 'policy-1',
            objectMetadataId: mockPolicyObjectMetadataItem.id,
            isSelected: true,
            isMatchingSearchFilter: true,
          },
        ],
        forceAdditionalFilter: POLICY_ALLOWLIST,
      }),
    );

    expect(getSearchVariables()).toEqual([
      expect.objectContaining({
        filter: {
          and: [{ not: { id: { in: ['policy-1'] } } }, POLICY_ALLOWLIST],
        },
      }),
      expect.objectContaining({
        filter: { and: [{ id: { in: ['policy-1'] } }, POLICY_ALLOWLIST] },
      }),
    ]);
  });

  it('keeps the filter for later searches such as typing', async () => {
    const performSearch = renderPerformSearch();

    await act(() =>
      performSearch({
        multipleRecordPickerInstanceId: PICKER_INSTANCE_ID,
        forceSearchableObjectMetadataItems: [mockPolicyObjectMetadataItem],
        forceAdditionalFilter: POLICY_ALLOWLIST,
      }),
    );

    await act(() =>
      performSearch({
        multipleRecordPickerInstanceId: PICKER_INSTANCE_ID,
        forceSearchFilter: 'smith',
      }),
    );

    expect(getSearchVariables()[1]).toEqual(
      expect.objectContaining({
        searchInput: 'smith',
        filter: POLICY_ALLOWLIST,
      }),
    );
  });
});
