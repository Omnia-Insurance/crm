import { useApolloClient } from '@apollo/client/react';
import { useStore } from 'jotai';
import { useEffect } from 'react';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { objectMetadataItemsByNameSingularMapSelector } from '@/object-metadata/states/objectMetadataItemsByNameSingularMapSelector';
import { IMPORT_JOB_POLL_INTERVAL_MS } from '@/spreadsheet-import/constants/ImportJobPollIntervalMs';
import { GET_IMPORT_JOB } from '@/spreadsheet-import/graphql/queries/importJob';
import { useCancelImportJob } from '@/spreadsheet-import/hooks/useCancelImportJob';
import { activeImportJobState } from '@/spreadsheet-import/states/activeImportJobState';
import { type ImportJobSummary } from '@/spreadsheet-import/types/ImportJobSummary';
import { getImportJobErrorMessages } from '@/spreadsheet-import/utils/getImportJobErrorMessages';
import { getImportJobLabel } from '@/spreadsheet-import/utils/getImportJobLabel';
import { readStoredActiveImportJob } from '@/spreadsheet-import/utils/readStoredActiveImportJob';
import { toBackgroundJobStatus } from '@/spreadsheet-import/utils/toBackgroundJobStatus';
import { writeStoredActiveImportJob } from '@/spreadsheet-import/utils/writeStoredActiveImportJob';
import { useBackgroundJob } from '@/ui/feedback/background-job-indicator/hooks/useBackgroundJob';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { isGraphqlErrorOfType } from '~/utils/is-graphql-error-of-type.util';

export const useImportJobPoller = () => {
  const apolloClient = useApolloClient();
  const apolloCoreClient = useApolloCoreClient();
  const store = useStore();
  const isLogged = useIsLogged();
  const activeImportJob = useAtomStateValue(activeImportJobState);
  const setActiveImportJob = useSetAtomState(activeImportJobState);
  const { upsertJob, removeJob } = useBackgroundJob();
  const { cancelImportJob } = useCancelImportJob();

  useEffect(() => {
    // An expired session keeps the page, and every signed-out poll would be refused
    if (!isDefined(activeImportJob) || !isLogged) {
      return;
    }

    const { importJobId, objectNameSingular } = activeImportJob;
    let isStopped = false;
    let isPollInFlight = false;

    // Only clears this job's tracking: a newer import may have replaced it
    const stopTracking = () => {
      isStopped = true;

      if (readStoredActiveImportJob()?.importJobId === importJobId) {
        writeStoredActiveImportJob(null);
      }

      setActiveImportJob((currentActiveImportJob) =>
        currentActiveImportJob?.importJobId === importJobId
          ? null
          : currentActiveImportJob,
      );
    };

    const stopTrackingUnreachableImportJob = () => {
      stopTracking();
      removeJob(importJobId);
    };

    const refreshImportedRecords = (namePlural: string) => {
      // Best effort: the list also refreshes on the next navigation
      apolloCoreClient
        .refetchQueries({
          updateCache: (cache) => {
            cache.evict({ fieldName: namePlural });
            cache.gc();
          },
        })
        .catch(() => undefined);
    };

    const poll = async () => {
      if (isStopped || isPollInFlight) {
        return;
      }

      isPollInFlight = true;

      try {
        const { data } = await apolloClient.query<{
          importJob: ImportJobSummary | null;
        }>({
          query: GET_IMPORT_JOB,
          variables: { importJobId },
          fetchPolicy: 'no-cache',
        });

        if (isStopped || !isDefined(data)) {
          return;
        }

        // Unknown, foreign and pre-upgrade ids answer null, and always will
        if (!isDefined(data.importJob)) {
          stopTrackingUnreachableImportJob();
          return;
        }

        const importJob = data.importJob;
        const status = toBackgroundJobStatus(importJob.status);
        const isRunning =
          status === 'uploading' ||
          status === 'pending' ||
          status === 'processing';
        const objectMetadataItem = store
          .get(objectMetadataItemsByNameSingularMapSelector.atom)
          .get(objectNameSingular);
        const errorMessages = isRunning
          ? []
          : getImportJobErrorMessages(importJob.result);

        upsertJob({
          id: importJobId,
          label: getImportJobLabel({
            objectLabelPlural:
              objectMetadataItem?.labelPlural ?? objectNameSingular,
            phase: isRunning ? importJob.result?.phase : undefined,
          }),
          status,
          totalItems: importJob.totalRecords,
          processedItems: importJob.processedRecords,
          successCount: importJob.successCount,
          warningCount: importJob.warningCount,
          failureCount: importJob.failureCount,
          ...(isNonEmptyArray(errorMessages) ? { errorMessages } : {}),
          ...(isRunning
            ? { onCancel: () => void cancelImportJob(importJobId) }
            : {}),
        });

        if (isRunning) {
          return;
        }

        stopTracking();

        if (importJob.successCount > 0 && isDefined(objectMetadataItem)) {
          refreshImportedRecords(objectMetadataItem.namePlural);
        }
      } catch (error) {
        // A requester without IMPORT_CSV gets FORBIDDEN on every poll; other
        // errors are transient and the next tick retries
        if (
          !isStopped &&
          (isGraphqlErrorOfType(error, 'NOT_FOUND') ||
            isGraphqlErrorOfType(error, 'FORBIDDEN'))
        ) {
          stopTrackingUnreachableImportJob();
        }
      } finally {
        isPollInFlight = false;
      }
    };

    void poll();

    const pollIntervalId = setInterval(
      () => void poll(),
      IMPORT_JOB_POLL_INTERVAL_MS,
    );

    return () => {
      isStopped = true;
      clearInterval(pollIntervalId);
    };
  }, [
    activeImportJob,
    apolloClient,
    apolloCoreClient,
    cancelImportJob,
    isLogged,
    removeJob,
    setActiveImportJob,
    store,
    upsertJob,
  ]);
};
