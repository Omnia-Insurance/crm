/* @license Enterprise */

import { RecordFilterGroupLogicalOperator } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { type UngroupedRecordFiltersRootGroup } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/wrapUngroupedRecordFiltersInRootGroup';

// Loaded rows go back without a group while they are the only rows and AND'ed, so opening keeps the stored rule.
// A new row or OR stores the group: it then owns one rule, where ungrouped predicates of another application
// would form a rule of their own that the engine ORs.
export const unwrapUngroupedRecordFiltersFromRootGroup = ({
  recordFilters,
  recordFilterGroups,
  ungroupedRecordFiltersRootGroup,
}: {
  recordFilters: RecordFilter[];
  recordFilterGroups: RecordFilterGroup[];
  ungroupedRecordFiltersRootGroup?: UngroupedRecordFiltersRootGroup;
}): {
  recordFilters: RecordFilter[];
  recordFilterGroups: RecordFilterGroup[];
} => {
  if (!isDefined(ungroupedRecordFiltersRootGroup)) {
    return { recordFilters, recordFilterGroups };
  }

  const { recordFilterGroupId, recordFilterIds } =
    ungroupedRecordFiltersRootGroup;

  const rootRecordFilterGroup = recordFilterGroups.find(
    ({ id }) => id === recordFilterGroupId,
  );

  const hasChildRecordFilterGroup = recordFilterGroups.some(
    ({ parentRecordFilterGroupId }) =>
      parentRecordFilterGroupId === recordFilterGroupId,
  );

  const holdsOnlyLoadedRecordFilters = recordFilters.every(
    (recordFilter) =>
      recordFilter.recordFilterGroupId !== recordFilterGroupId ||
      recordFilterIds.includes(recordFilter.id),
  );

  if (
    rootRecordFilterGroup?.logicalOperator !==
      RecordFilterGroupLogicalOperator.AND ||
    hasChildRecordFilterGroup ||
    !holdsOnlyLoadedRecordFilters
  ) {
    return { recordFilters, recordFilterGroups };
  }

  return {
    recordFilters: recordFilters.map((recordFilter) =>
      recordFilter.recordFilterGroupId === recordFilterGroupId
        ? { ...recordFilter, recordFilterGroupId: undefined }
        : recordFilter,
    ),
    recordFilterGroups: recordFilterGroups.filter(
      ({ id }) => id !== recordFilterGroupId,
    ),
  };
};
