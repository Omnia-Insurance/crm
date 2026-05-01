import { useStore } from 'jotai';
import { useCallback } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDraftRecordDefaults } from '@/object-record/hooks/useDraftRecordDefaults';
import { type TaskTarget } from '@/activities/types/TaskTarget';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { draftRecordIdsState } from '@/object-record/record-side-panel/states/draftRecordIdsState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';

/**
 * Opens the side panel with a *draft* task (not yet persisted) targeting
 * a reviewItem. The task only commits to the API when the reviewer types
 * a title and clicks Create — accidental clicks of "Create task" on the
 * review row leave nothing behind.
 *
 * Mirrors the lead/policy creation pattern in `useCreateNewIndexRecord`:
 *   1. Generate a fresh recordId.
 *   2. Seed `recordStoreFamilyState[recordId]` with task defaults.
 *   3. Register `recordId` in `draftRecordIdsState` so the side panel
 *      renders it in draft mode.
 *   4. Pass `onRecordCreated` so the TaskTarget linking task → reviewItem
 *      is created exactly when the task itself is created (not before).
 *   5. The caller's `onTaskCreated` callback fires AFTER the link is in
 *      place — used to auto-flip review-item decision to FLAG_AUDIT.
 */
export const useOpenCreateAuditTaskDraft = ({
  onTaskCreated,
}: {
  onTaskCreated?: () => void | Promise<void>;
} = {}) => {
  const store = useStore();

  const { objectMetadataItem: taskObjectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Task,
  });

  const { buildDraftSeeds } = useDraftRecordDefaults({
    objectMetadataItem: taskObjectMetadataItem,
  });

  const { createOneRecord: createOneTaskTarget } =
    useCreateOneRecord<TaskTarget>({
      objectNameSingular: CoreObjectNameSingular.TaskTarget,
      shouldMatchRootQueryFilter: true,
    });

  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const openCreateAuditTaskDraft = useCallback(
    ({ reviewItemId }: { reviewItemId: string }) => {
      const taskId = v4();

      const { seedValues, rlsFieldNames } = buildDraftSeeds({
        includeRestrictedFields: true,
      });

      store.set(recordStoreFamilyState.atomFamily(taskId), {
        id: taskId,
        ...seedValues,
      } as ObjectRecord);

      const draftMap = new Map(store.get(draftRecordIdsState.atom));
      draftMap.set(taskId, {
        objectNameSingular: CoreObjectNameSingular.Task,
        objectMetadataItem: taskObjectMetadataItem,
        hiddenFieldNames: new Set(['position', ...rlsFieldNames]),
        extraRecordInput: {},
        onRecordCreated: async (createdTask) => {
          if (!isDefined(createdTask?.id)) return;

          await createOneTaskTarget({
            taskId: createdTask.id,
            targetReviewItemId: reviewItemId,
          } as Partial<TaskTarget>);

          await onTaskCreated?.();
        },
      });
      store.set(draftRecordIdsState.atom, draftMap);

      openRecordInSidePanel({
        recordId: taskId,
        objectNameSingular: CoreObjectNameSingular.Task,
        isNewRecord: true,
      });
    },
    [
      store,
      buildDraftSeeds,
      taskObjectMetadataItem,
      createOneTaskTarget,
      openRecordInSidePanel,
      onTaskCreated,
    ],
  );

  return { openCreateAuditTaskDraft };
};
