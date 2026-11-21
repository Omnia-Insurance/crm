import uniqBy from 'lodash.uniqby';
import { useMemo } from 'react';
import { StandardObjectNameSingular } from 'twenty-shared/types';
import {
  combineFilters,
  computeRecordGqlOperationFilter,
  isEmptyObject,
  turnAnyFieldFilterIntoRecordGqlFilter,
} from 'twenty-shared/utils';

import { useTasks } from '@/activities/tasks/hooks/useTasks';
import { type Task } from '@/activities/types/Task';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { flattenedFieldMetadataItemsSelector } from '@/object-metadata/states/flattenedFieldMetadataItemsSelector';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { generateDepthRecordGqlFieldsFromObject } from '@/object-record/graphql/record-gql-fields/utils/generateDepthRecordGqlFieldsFromObject';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { currentRecordFilterGroupsComponentState } from '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState';
import { useFilterValueDependencies } from '@/object-record/record-filter/hooks/useFilterValueDependencies';
import { anyFieldFilterValueComponentState } from '@/object-record/record-filter/states/anyFieldFilterValueComponentState';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const REVIEW_ITEM_TASKS_LIMIT = 200;

type UseFilteredTasksForReviewItemParams = {
  reviewItemId: string;
  viewBarId: string;
};

// Tasks reach a review item through taskTarget rows, which the task filter
// cannot traverse, so filtering re-queries the linked task ids.
export const useFilteredTasksForReviewItem = ({
  reviewItemId,
  viewBarId,
}: UseFilteredTasksForReviewItemParams) => {
  const { objectMetadataItem: taskObjectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: StandardObjectNameSingular.Task,
  });
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const flattenedFieldMetadataItems = useAtomStateValue(
    flattenedFieldMetadataItemsSelector,
  );

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

  const { tasks, tasksLoading } = useTasks({
    targetableObjects: [
      { id: reviewItemId, targetObjectNameSingular: 'reviewItem' },
    ],
  });

  const tasksLinkedToReviewItem = uniqBy(tasks, 'id');
  const linkedTaskIds = tasksLinkedToReviewItem.map((task) => task.id);

  const { recordGqlOperationFilter: anyFieldFilter } =
    turnAnyFieldFilterIntoRecordGqlFilter({
      filterValue: anyFieldFilterValue,
      fields: taskObjectMetadataItem.readableFields,
    });

  const taskUserFilter = combineFilters([
    computeRecordGqlOperationFilter({
      filterValueDependencies,
      fieldMetadataItems: flattenedFieldMetadataItems,
      recordFilters: currentRecordFilters,
      recordFilterGroups: currentRecordFilterGroups,
    }),
    anyFieldFilter,
  ]);

  const shouldFilterLinkedTasks =
    !isEmptyObject(taskUserFilter) && linkedTaskIds.length > 0;

  const taskRecordGqlFields = useMemo(
    () =>
      generateDepthRecordGqlFieldsFromObject({
        objectMetadataItems,
        objectMetadataItem: taskObjectMetadataItem,
        depth: 0,
      }),
    [objectMetadataItems, taskObjectMetadataItem],
  );

  const { records: filteredTasks, loading: filteredTasksLoading } =
    useFindManyRecords<Task>({
      objectNameSingular: StandardObjectNameSingular.Task,
      filter: combineFilters([{ id: { in: linkedTaskIds } }, taskUserFilter]),
      recordGqlFields: taskRecordGqlFields,
      orderBy: [{ createdAt: 'DescNullsLast' }],
      limit: REVIEW_ITEM_TASKS_LIMIT,
      skip: !shouldFilterLinkedTasks,
    });

  return {
    tasks: shouldFilterLinkedTasks ? filteredTasks : tasksLinkedToReviewItem,
    loading: tasksLoading || (shouldFilterLinkedTasks && filteredTasksLoading),
    hasActiveFilters:
      currentRecordFilters.length > 0 ||
      currentRecordFilterGroups.length > 0 ||
      anyFieldFilterValue.length > 0,
  };
};
