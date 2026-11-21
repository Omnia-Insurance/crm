import { useMemo } from 'react';
import { type RecordGqlOperationFilter } from 'twenty-shared/types';
import {
  computeRecordGqlOperationFilter,
  turnAnyFieldFilterIntoRecordGqlFilter,
} from 'twenty-shared/utils';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { currentRecordFilterGroupsComponentState } from '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState';
import { useFilterValueDependencies } from '@/object-record/record-filter/hooks/useFilterValueDependencies';
import { anyFieldFilterValueComponentState } from '@/object-record/record-filter/states/anyFieldFilterValueComponentState';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { makeAndFilterVariables } from '@/object-record/utils/makeAndFilterVariables';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';

type UseReconciliationActiveFilterParams = {
  viewBarId: string;
  reconciliationId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
};

type UseReconciliationActiveFilterResult = {
  filter: RecordGqlOperationFilter;
  hasActiveFilters: boolean;
};

// The reviewer's filters, always narrowed to this reconciliation's items.
export const useReconciliationActiveFilter = ({
  viewBarId,
  reconciliationId,
  reviewItemMetadata,
}: UseReconciliationActiveFilterParams): UseReconciliationActiveFilterResult => {
  const currentRecordFilters = useAtomComponentStateValue(
    currentRecordFiltersComponentState,
    viewBarId,
  );
  const currentRecordFilterGroups = useAtomComponentStateValue(
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
      fieldMetadataItems: reviewItemMetadata.readableFields,
      recordFilters: currentRecordFilters,
      recordFilterGroups: currentRecordFilterGroups,
    });

    const { recordGqlOperationFilter: anyFieldFilter } =
      turnAnyFieldFilterIntoRecordGqlFilter({
        filterValue: anyFieldFilterValue,
        fields: reviewItemMetadata.readableFields,
      });

    const merged =
      makeAndFilterVariables([
        { reconciliationId: { eq: reconciliationId } },
        userFilter,
        anyFieldFilter,
      ]) ?? {};

    const hasActiveFilters =
      currentRecordFilters.length > 0 ||
      currentRecordFilterGroups.length > 0 ||
      anyFieldFilterValue.length > 0;

    return { filter: merged, hasActiveFilters };
  }, [
    currentRecordFilters,
    currentRecordFilterGroups,
    anyFieldFilterValue,
    reconciliationId,
    reviewItemMetadata.readableFields,
    filterValueDependencies,
  ]);
};
