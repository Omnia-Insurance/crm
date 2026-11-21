import { useLingui } from '@lingui/react/macro';
import { useCallback } from 'react';
import { StandardObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { v4 } from 'uuid';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useBuildRecordInputFromRLSPredicates } from '@/object-record/hooks/useBuildRecordInputFromRLSPredicates';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useObjectMorphJunctionConfigOrThrow } from '@/object-record/record-field/ui/hooks/useObjectMorphJunctionConfigOrThrow';
import { createRecordWithAttachmentHandler } from '@/object-record/record-field/ui/meta-types/input/utils/createRecordWithAttachmentHandler';
import { findTargetFieldInfo } from '@/object-record/record-field/ui/utils/junction/findTargetFieldInfo';
import { useRecordCreationForm } from '@/object-record/record-form/hooks/useRecordCreationForm';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';

type UseOpenCreateAuditTaskDraftParams = {
  onTaskCreated?: () => void | Promise<void>;
};

// Nothing is saved until the reviewer submits the task creation form, so an
// accidental "Create task" click on a review row leaves no record behind.
export const useOpenCreateAuditTaskDraft = ({
  onTaskCreated,
}: UseOpenCreateAuditTaskDraftParams = {}) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();

  const { objectMetadataItem: taskObjectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: StandardObjectNameSingular.Task,
  });
  const { objectMetadataItems } = useObjectMetadataItems();

  const { junctionObjectMetadata, sourceJoinColumnName } =
    useObjectMorphJunctionConfigOrThrow({
      objectNameSingular: StandardObjectNameSingular.Task,
    });

  const { createOneRecord: createOneTask } = useCreateOneRecord({
    objectNameSingular: StandardObjectNameSingular.Task,
  });
  const { createOneRecord: createOneTaskTarget } = useCreateOneRecord({
    objectNameSingular: junctionObjectMetadata.nameSingular,
    shouldMatchRootQueryFilter: true,
  });
  const { updateOneRecord } = useUpdateOneRecord();

  const { buildRecordInputFromRLSPredicates } =
    useBuildRecordInputFromRLSPredicates({
      objectMetadataItem: taskObjectMetadataItem,
    });
  const { requestRecordCreation } = useRecordCreationForm();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const reviewItemObjectMetadataItem = objectMetadataItems.find(
    (objectMetadataItem) => objectMetadataItem.nameSingular === 'reviewItem',
  );

  const reviewItemJoinColumnName = isDefined(reviewItemObjectMetadataItem)
    ? findTargetFieldInfo(
        junctionObjectMetadata.fields,
        reviewItemObjectMetadataItem.id,
        objectMetadataItems,
      )?.joinColumnName
    : undefined;

  const openCreateAuditTaskDraft = useCallback(
    ({ reviewItemId }: { reviewItemId: string }) => {
      if (!isDefined(reviewItemJoinColumnName)) {
        enqueueToast({
          status: 'error',
          children: t`Tasks cannot be linked to review items in this workspace.`,
        });
        return;
      }

      // The form calls createRecord again after a failed Create; the handler
      // reuses the task it already saved, so a retry never inserts a second one.
      const createTaskLinkedToReviewItem = createRecordWithAttachmentHandler({
        fieldMetadataItems: taskObjectMetadataItem.fields,
        createRecord: (recordInput) =>
          createOneTask({ ...recordInput, id: v4() }),
        updateRecord: async ({ recordId, recordInput }) => {
          await updateOneRecord({
            objectNameSingular: StandardObjectNameSingular.Task,
            idToUpdate: recordId,
            updateOneRecordInput: recordInput,
          });
        },
        attachRecord: async (taskId) => {
          await createOneTaskTarget({
            id: v4(),
            [sourceJoinColumnName]: taskId,
            [reviewItemJoinColumnName]: reviewItemId,
          });
        },
      });

      const createAuditTask = async () => {
        try {
          const createdTask = await requestRecordCreation({
            objectMetadataItem: taskObjectMetadataItem,
            initialDraftRecord: buildRecordInputFromRLSPredicates(),
            canCreateAnother: false,
            createRecord: createTaskLinkedToReviewItem,
          });

          if (!isDefined(createdTask)) {
            return;
          }

          openRecordInSidePanel({
            recordId: createdTask.id,
            objectNameSingular: StandardObjectNameSingular.Task,
          });

          // Runs once the form has settled, so a failure here cannot re-run the creation.
          await onTaskCreated?.();
        } catch (error) {
          enqueueToast(getToastOptionsFromError({ error }));
        }
      };

      void createAuditTask();
    },
    [
      buildRecordInputFromRLSPredicates,
      createOneTask,
      createOneTaskTarget,
      enqueueToast,
      onTaskCreated,
      openRecordInSidePanel,
      requestRecordCreation,
      reviewItemJoinColumnName,
      sourceJoinColumnName,
      t,
      taskObjectMetadataItem,
      updateOneRecord,
    ],
  );

  return { openCreateAuditTaskDraft };
};
