import { useMemo } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { currentRecordFilterGroupsComponentState } from '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState';
import { useFilterValueDependencies } from '@/object-record/record-filter/hooks/useFilterValueDependencies';
import { anyFieldFilterValueComponentState } from '@/object-record/record-filter/states/anyFieldFilterValueComponentState';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { makeAndFilterVariables } from '@/object-record/utils/makeAndFilterVariables';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { type RecordGqlOperationFilter } from 'twenty-shared/types';
import {
  computeRecordGqlOperationFilter,
  turnAnyFieldFilterIntoRecordGqlFilter,
} from 'twenty-shared/utils';

type Params = {
  viewBarId: string;
  reconciliationId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
};

type Result = {
  filter: RecordGqlOperationFilter;
  hasActiveFilters: boolean;
};

/**
 * Reads native Twenty filter atoms scoped by `viewBarId` and AND-merges them
 * with the per-reconciliation `reconciliationId` filter that always applies.
 * The returned filter is suitable for `useFindManyRecords`.
 */
export const useReconciliationActiveFilter = ({
  viewBarId,
  reconciliationId,
  reviewItemMetadata,
}: Params): Result => {
  const recordFilters = useAtomComponentStateValue(
    currentRecordFiltersComponentState,
    viewBarId,
  );
  const recordFilterGroups = useAtomComponentStateValue(
    currentRecordFilterGroupsComponentState,
    viewBarId,
  );
  const anyFieldFilterValue = useAtomComponentStateValue(
    anyFieldFilterValueComponentState,
    viewBarId,
  );

  const { filterValueDependencies } = useFilterValueDependencies();

  return useMemo(() => {
    const userFilter = computeRecordGqlOperationFilter({
      filterValueDependencies,
      fields: reviewItemMetadata.fields,
      recordFilters,
      recordFilterGroups,
    });

    const { recordGqlOperationFilter: anyFieldFilter } =
      turnAnyFieldFilterIntoRecordGqlFilter({
        filterValue: anyFieldFilterValue,
        fields: reviewItemMetadata.fields,
      });

    const merged =
      makeAndFilterVariables([
        { reconciliationId: { eq: reconciliationId } },
        userFilter,
        anyFieldFilter,
      ]) ?? {};

    const hasActiveFilters =
      recordFilters.length > 0 ||
      recordFilterGroups.length > 0 ||
      anyFieldFilterValue.length > 0;

    return { filter: merged, hasActiveFilters };
  }, [
    recordFilters,
    recordFilterGroups,
    anyFieldFilterValue,
    reconciliationId,
    reviewItemMetadata.fields,
    filterValueDependencies,
  ]);
};
