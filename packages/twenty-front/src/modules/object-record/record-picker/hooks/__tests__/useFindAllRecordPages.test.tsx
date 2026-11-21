import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { QUERY_MAX_RECORDS } from 'twenty-shared/constants';

import { useFindAllRecordPages } from '@/object-record/record-picker/hooks/useFindAllRecordPages';
import { isFetchingMoreRecordsFamilyState } from '@/object-record/states/isFetchingMoreRecordsFamilyState';

const mockUseFindManyRecords = jest.fn();
const mockFetchMoreRecords = jest.fn();

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (params: unknown) => mockUseFindManyRecords(params),
}));

const QUERY_IDENTIFIER = 'policy-eligible-ids-query';

const buildRecords = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `policy-${index}`,
    __typename: 'Policy',
  }));

const mockFindManyRecordsState = ({
  recordCount,
  hasNextPage,
  loading = false,
  error,
}: {
  recordCount: number;
  hasNextPage: boolean;
  loading?: boolean;
  error?: Error;
}) =>
  mockUseFindManyRecords.mockReturnValue({
    records: buildRecords(recordCount),
    loading,
    error,
    pageInfo: { hasNextPage },
    fetchMoreRecords: mockFetchMoreRecords,
    queryIdentifier: QUERY_IDENTIFIER,
  });

const renderFindAllRecordPages = ({
  store = createStore(),
  maximumRecordCount,
}: {
  store?: ReturnType<typeof createStore>;
  maximumRecordCount?: number;
} = {}) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  return renderHook(
    () =>
      useFindAllRecordPages({
        objectNameSingular: 'policy',
        filter: { leadId: { is: 'NULL' } },
        recordGqlFields: { id: true },
        maximumRecordCount,
      }),
    { wrapper: Wrapper },
  );
};

describe('useFindAllRecordPages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchMoreRecords.mockResolvedValue({ data: {} });
  });

  it('asks the server for full pages', () => {
    mockFindManyRecordsState({ recordCount: 0, hasNextPage: false });

    renderFindAllRecordPages();

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'policy',
        filter: { leadId: { is: 'NULL' } },
        recordGqlFields: { id: true },
        limit: QUERY_MAX_RECORDS,
      }),
    );
  });

  it('fetches the next page and stays loading while the server reports more', async () => {
    mockFindManyRecordsState({
      recordCount: QUERY_MAX_RECORDS,
      hasNextPage: true,
    });

    const { result } = renderFindAllRecordPages();

    await act(async () => {});

    expect(mockFetchMoreRecords).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);
    expect(result.current.records).toHaveLength(QUERY_MAX_RECORDS);
  });

  it('returns every record once the last page is in', async () => {
    mockFindManyRecordsState({
      recordCount: QUERY_MAX_RECORDS + 50,
      hasNextPage: false,
    });

    const { result } = renderFindAllRecordPages();

    await act(async () => {});

    expect(mockFetchMoreRecords).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.records).toHaveLength(QUERY_MAX_RECORDS + 50);
  });

  it('waits for the first page before paging', async () => {
    mockFindManyRecordsState({
      recordCount: 0,
      hasNextPage: true,
      loading: true,
    });

    const { result } = renderFindAllRecordPages();

    await act(async () => {});

    expect(mockFetchMoreRecords).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
  });

  it('stops at the maximum record count', async () => {
    mockFindManyRecordsState({ recordCount: 3, hasNextPage: true });

    const { result } = renderFindAllRecordPages({ maximumRecordCount: 3 });

    await act(async () => {});

    expect(mockFetchMoreRecords).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('does not start a page that is already being fetched', async () => {
    const store = createStore();

    store.set(
      isFetchingMoreRecordsFamilyState.atomFamily(QUERY_IDENTIFIER),
      true,
    );
    mockFindManyRecordsState({
      recordCount: QUERY_MAX_RECORDS,
      hasNextPage: true,
    });

    const { result } = renderFindAllRecordPages({ store });

    await act(async () => {});

    expect(mockFetchMoreRecords).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
  });

  it('stops paging after a failed page instead of retrying', async () => {
    mockFetchMoreRecords.mockResolvedValue({ error: new Error('Network') });
    mockFindManyRecordsState({
      recordCount: QUERY_MAX_RECORDS,
      hasNextPage: true,
    });

    const { result, rerender } = renderFindAllRecordPages();

    await act(async () => {});
    rerender();
    await act(async () => {});

    expect(mockFetchMoreRecords).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.records).toHaveLength(QUERY_MAX_RECORDS);
  });

  it('ends without paging when the first page failed', async () => {
    mockFindManyRecordsState({
      recordCount: 0,
      hasNextPage: true,
      error: new Error('Forbidden'),
    });

    const { result } = renderFindAllRecordPages();

    await act(async () => {});

    expect(mockFetchMoreRecords).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});
