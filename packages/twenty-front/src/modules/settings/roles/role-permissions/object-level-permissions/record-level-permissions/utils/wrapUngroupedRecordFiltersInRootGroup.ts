/* @license Enterprise */

import { RecordFilterGroupLogicalOperator } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';

export type UngroupedRecordFiltersRootGroup = {
  recordFilterGroupId: string;
  recordFilterIds: string[];
};

// Predicates stored without a group (the C2 hop) are one AND rule, but the builder only
// renders the rows of a root group, so they load under an AND root group of their own
export const wrapUngroupedRecordFiltersInRootGroup = ({
  recordFilters,
  recordFilterGroups,
  rootRecordFilterGroupId,
}: {
  recordFilters: RecordFilter[];
  recordFilterGroups: RecordFilterGroup[];
  rootRecordFilterGroupId: string;
}): {
  recordFilters: RecordFilter[];
  recordFilterGroups: RecordFilterGroup[];
  ungroupedRecordFiltersRootGroup?: UngroupedRecordFiltersRootGroup;
} => {
  const ungroupedRecordFilterIds = recordFilters
    .filter(({ recordFilterGroupId }) => !isDefined(recordFilterGroupId))
    .map(({ id }) => id);

  const hasRootRecordFilterGroup = recordFilterGroups.some(
    ({ parentRecordFilterGroupId }) => !isDefined(parentRecordFilterGroupId),
  );

  // Next to a root group they are a second rule that the engine ORs, so moving them in would narrow access
  if (ungroupedRecordFilterIds.length === 0 || hasRootRecordFilterGroup) {
    return { recordFilters, recordFilterGroups };
  }

  return {
    recordFilters: recordFilters.map((recordFilter) =>
      isDefined(recordFilter.recordFilterGroupId)
        ? recordFilter
        : { ...recordFilter, recordFilterGroupId: rootRecordFilterGroupId },
    ),
    recordFilterGroups: [
      ...recordFilterGroups,
      {
        id: rootRecordFilterGroupId,
        parentRecordFilterGroupId: null,
        logicalOperator: RecordFilterGroupLogicalOperator.AND,
        positionInRecordFilterGroup: null,
      },
    ],
    ungroupedRecordFiltersRootGroup: {
      recordFilterGroupId: rootRecordFilterGroupId,
      recordFilterIds: ungroupedRecordFilterIds,
    },
  };
};
