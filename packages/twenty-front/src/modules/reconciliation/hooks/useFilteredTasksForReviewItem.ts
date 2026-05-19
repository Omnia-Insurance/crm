import { findActivityTargetsOperationSignatureFactory } from '@/activities/graphql/operation-signatures/factories/findActivityTargetsOperationSignatureFactory';
import { type Task } from '@/activities/types/Task';
import { type TaskTarget } from '@/activities/types/TaskTarget';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { fieldMetadataItemByIdMapSelector } from '@/object-metadata/states/fieldMetadataItemByIdMapSelector';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { generateDepthRecordGqlFieldsFromObject } from '@/object-record/graphql/record-gql-fields/utils/generateDepthRecordGqlFieldsFromObject';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { currentRecordFilterGroupsComponentState } from '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState';
import { useFilterValueDependencies } from '@/object-record/record-filter/hooks/useFilterValueDependencies';
import { anyFieldFilterValueComponentState } from '@/object-record/record-filter/states/anyFieldFilterValueComponentState';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useMemo } from 'react';
import {
  CoreObjectNameSingular,
  type RecordGqlOperationFilter,
} from 'twenty-shared/types';
import {
  computeRecordGqlOperationFilter,
  isDefined,
  turnAnyFieldFilterIntoRecordGqlFilter,
} from 'twenty-shared/utils';

type Params = {
  reviewItemId: string;
  viewBarId: string;
};

type Result = {
  tasks: Task[];
  loading: boolean;
  hasActiveFilters: boolean;
};

/**
 * Returns the audit tasks attached to `reviewItemId`, optionally narrowed by
 * the native Twenty filter atoms scoped to `viewBarId` (resolved against Task
 * fields).
 *
 * Two-step query because Twenty's GraphQL backend rejects nested filters on
 * MANY_TO_ONE relations (you'd get "Cannot filter by relation field 'task':
 * use 'taskId' instead"):
 *
 *   1. Query taskTargets where targetReviewItemId == reviewItemId to get the
 *      taskTarget rows + nested task records for this reviewItem.
 *   2. If the user has any active filters, query Tasks where
 *      `id IN (those task ids) AND <userFilter>`. Otherwise reuse the tasks
 *      from step 1.
 */
export const useFilteredTasksForReviewItem = ({
  reviewItemId,
  viewBarId,
}: Params): Result => {
  const { objectMetadataItem: taskMetadata } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Task,
  });

  const objectMetadataItems = useAtomStateValue<EnrichedObjectMetadataItem[]>(
    objectMetadataItemsSelector,
  );
  const fieldMetadataItemByIdMap = useAtomStateValue(
    fieldMetadataItemByIdMapSelector,
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

  const { taskUserFilter, hasActiveFilters } = useMemo(() => {
    const userFilter = computeRecordGqlOperationFilter({
      filterValueDependencies,
      findFieldMetadataItemById: (id) => fieldMetadataItemByIdMap.get(id),
      recordFilters: currentRecordFilters,
      recordFilterGroups: currentRecordFilterGroups,
    });

    const { recordGqlOperationFilter: anyFieldFilter } =
      turnAnyFieldFilterIntoRecordGqlFilter({
        filterValue: anyFieldFilterValue,
        fields: taskMetadata.fields,
      });

    const filters = [userFilter, anyFieldFilter].filter((f) => {
      if (!isDefined(f)) return false;
      return Object.keys(f as Record<string, unknown>).length > 0;
    }) as RecordGqlOperationFilter[];

    const merged: RecordGqlOperationFilter | undefined =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : { and: filters };

    return {
      taskUserFilter: merged,
      hasActiveFilters:
        currentRecordFilters.length > 0 ||
        currentRecordFilterGroups.length > 0 ||
        anyFieldFilterValue.length > 0,
    };
  }, [
    filterValueDependencies,
    fieldMetadataItemByIdMap,
    taskMetadata.fields,
    currentRecordFilters,
    currentRecordFilterGroups,
    anyFieldFilterValue,
  ]);

  // Step 1: all taskTargets for this reviewItem (with the joined task)
  const FIND_TASK_TARGETS_OPERATION_SIGNATURE = useMemo(
    () =>
      findActivityTargetsOperationSignatureFactory({
        objectNameSingular: CoreObjectNameSingular.Task,
        objectMetadataItems,
      }),
    [objectMetadataItems],
  );

  const { records: taskTargets, loading: taskTargetsLoading } =
    useFindManyRecords<TaskTarget>({
      objectNameSingular:
        FIND_TASK_TARGETS_OPERATION_SIGNATURE.objectNameSingular,
      filter: { targetReviewItemId: { eq: reviewItemId } },
      recordGqlFields: FIND_TASK_TARGETS_OPERATION_SIGNATURE.fields,
      orderBy: [{ createdAt: 'DescNullsLast' }],
      limit: 200,
    });

  const allTasksForReviewItem = useMemo(() => {
    const seen = new Set<string>();
    const result: Task[] = [];
    for (const target of taskTargets) {
      const task = target.task as Task | undefined;
      if (!task?.id || seen.has(task.id)) continue;
      seen.add(task.id);
      result.push(task);
    }
    return result;
  }, [taskTargets]);

  const taskIds = useMemo(
    () => allTasksForReviewItem.map((task) => task.id),
    [allTasksForReviewItem],
  );

  // Step 2: when there's a user filter, re-query Tasks with id IN (...) AND
  // <userFilter> to apply the filter on the task side. Skipped when there's
  // no filter (or no taskIds), which avoids an extra round-trip.
  const taskGqlFields = useMemo(
    () =>
      generateDepthRecordGqlFieldsFromObject({
        objectMetadataItems,
        objectMetadataItem: taskMetadata,
        depth: 0,
      }),
    [objectMetadataItems, taskMetadata],
  );

  const filteredTasksFilter = useMemo<
    RecordGqlOperationFilter | undefined
  >(() => {
    if (!isDefined(taskUserFilter) || taskIds.length === 0) {
      return undefined;
    }
    return { and: [{ id: { in: taskIds } }, taskUserFilter] };
  }, [taskIds, taskUserFilter]);

  const skipFilteredQuery = !isDefined(taskUserFilter) || taskIds.length === 0;

  const { records: filteredTasks, loading: filteredTasksLoading } =
    useFindManyRecords<Task>({
      objectNameSingular: CoreObjectNameSingular.Task,
      filter: filteredTasksFilter ?? {},
      recordGqlFields: taskGqlFields,
      orderBy: [{ createdAt: 'DescNullsLast' }],
      limit: 200,
      skip: skipFilteredQuery,
    });

  const tasks = useMemo(() => {
    if (skipFilteredQuery) return allTasksForReviewItem;
    // Preserve the createdAt-desc order from the filtered query.
    return filteredTasks;
  }, [skipFilteredQuery, allTasksForReviewItem, filteredTasks]);

  return {
    tasks,
    loading: taskTargetsLoading || (!skipFilteredQuery && filteredTasksLoading),
    hasActiveFilters,
  };
};
