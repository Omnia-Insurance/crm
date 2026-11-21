import { useStore } from 'jotai';
import { useEffect, useState } from 'react';
import { QUERY_MAX_RECORDS } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import {
  type UseFindManyRecordsParams,
  useFindManyRecords,
} from '@/object-record/hooks/useFindManyRecords';
import { isFetchingMoreRecordsFamilyState } from '@/object-record/states/isFetchingMoreRecordsFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';

// 100 pages of QUERY_MAX_RECORDS, the allowlist size before the merge
export const FIND_ALL_RECORD_PAGES_MAXIMUM_RECORD_COUNT = 20000;

type UseFindAllRecordPagesParams<TRecord> = Omit<
  UseFindManyRecordsParams<TRecord>,
  'limit' | 'cursorFilter'
> & {
  maximumRecordCount?: number;
};

// The server caps every find-many page at QUERY_MAX_RECORDS, so an id
// allowlist built from the first page alone silently drops the rest
export const useFindAllRecordPages = <
  TRecord extends ObjectRecord = ObjectRecord,
>({
  maximumRecordCount = FIND_ALL_RECORD_PAGES_MAXIMUM_RECORD_COUNT,
  ...findManyRecordsParams
}: UseFindAllRecordPagesParams<TRecord>) => {
  const store = useStore();

  const {
    records,
    loading,
    error,
    pageInfo,
    fetchMoreRecords,
    queryIdentifier,
  } = useFindManyRecords<TRecord>({
    ...findManyRecordsParams,
    limit: QUERY_MAX_RECORDS,
  });

  const isFetchingMoreRecords = useAtomFamilyStateValue(
    isFetchingMoreRecordsFamilyState,
    queryIdentifier,
  );

  const [stoppedQueryIdentifier, setStoppedQueryIdentifier] = useState<
    string | undefined
  >(undefined);

  const hasMorePagesToFetch =
    !isDefined(error) &&
    stoppedQueryIdentifier !== queryIdentifier &&
    pageInfo?.hasNextPage === true &&
    records.length < maximumRecordCount;

  useEffect(() => {
    if (loading || !hasMorePagesToFetch || isFetchingMoreRecords) {
      return;
    }

    // Read live: another picker on this query may have started the page in
    // this same commit
    if (
      store.get(isFetchingMoreRecordsFamilyState.atomFamily(queryIdentifier))
    ) {
      return;
    }

    const fetchNextPage = async () => {
      const result = await fetchMoreRecords();

      // A failed or skipped page ends the paging rather than retrying forever
      if (!isDefined(result) || 'error' in result) {
        setStoppedQueryIdentifier(queryIdentifier);
      }
    };

    fetchNextPage();
  }, [
    fetchMoreRecords,
    hasMorePagesToFetch,
    isFetchingMoreRecords,
    loading,
    queryIdentifier,
    store,
  ]);

  return {
    records,
    loading: loading || hasMorePagesToFetch,
  };
};
