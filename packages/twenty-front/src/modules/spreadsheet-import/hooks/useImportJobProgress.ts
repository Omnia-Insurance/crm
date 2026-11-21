import { useStore } from 'jotai';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { objectMetadataItemsByNameSingularMapSelector } from '@/object-metadata/states/objectMetadataItemsByNameSingularMapSelector';
import { useCancelImportJob } from '@/spreadsheet-import/hooks/useCancelImportJob';
import {
  type ActiveImportJob,
  activeImportJobState,
} from '@/spreadsheet-import/states/activeImportJobState';
import { getImportJobLabel } from '@/spreadsheet-import/utils/getImportJobLabel';
import { writeStoredActiveImportJob } from '@/spreadsheet-import/utils/writeStoredActiveImportJob';
import { useBackgroundJob } from '@/ui/feedback/background-job-indicator/hooks/useBackgroundJob';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

export const useImportJobProgress = () => {
  const store = useStore();
  const setActiveImportJob = useSetAtomState(activeImportJobState);
  const { upsertJob, removeJob } = useBackgroundJob();
  const { cancelImportJob } = useCancelImportJob();

  const startTracking = useCallback(
    ({ importJobId, objectNameSingular, totalRecords }: ActiveImportJob) => {
      const previousActiveImportJob = store.get(activeImportJobState.atom);

      // Only one import is polled at a time, so nothing would update this card
      if (
        isDefined(previousActiveImportJob) &&
        previousActiveImportJob.importJobId !== importJobId
      ) {
        removeJob(previousActiveImportJob.importJobId);
      }

      const activeImportJob = { importJobId, objectNameSingular, totalRecords };
      const objectMetadataItem = store
        .get(objectMetadataItemsByNameSingularMapSelector.atom)
        .get(objectNameSingular);

      writeStoredActiveImportJob(activeImportJob);

      upsertJob({
        id: importJobId,
        label: getImportJobLabel({
          objectLabelPlural:
            objectMetadataItem?.labelPlural ?? objectNameSingular,
        }),
        status: 'pending',
        totalItems: totalRecords,
        processedItems: 0,
        successCount: 0,
        warningCount: 0,
        failureCount: 0,
        onCancel: () => void cancelImportJob(importJobId),
      });

      setActiveImportJob(activeImportJob);
    },
    [cancelImportJob, removeJob, setActiveImportJob, store, upsertJob],
  );

  return { startTracking };
};
