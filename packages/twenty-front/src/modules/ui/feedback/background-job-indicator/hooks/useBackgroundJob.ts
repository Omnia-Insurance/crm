import { useCallback } from 'react';

import {
  backgroundJobsState,
  type BackgroundJobData,
} from '@/ui/feedback/background-job-indicator/states/backgroundJobState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

export const useBackgroundJob = () => {
  const setBackgroundJobs = useSetAtomState(backgroundJobsState);

  const upsertJob = useCallback(
    (job: BackgroundJobData) => {
      setBackgroundJobs((previousJobs) => {
        const existingJobIndex = previousJobs.findIndex(
          (existingJob) => existingJob.id === job.id,
        );

        if (existingJobIndex >= 0) {
          const updatedJobs = [...previousJobs];

          updatedJobs[existingJobIndex] = job;

          return updatedJobs;
        }

        return [...previousJobs, job];
      });
    },
    [setBackgroundJobs],
  );

  const removeJob = useCallback(
    (jobId: string) => {
      setBackgroundJobs((previousJobs) =>
        previousJobs.filter((existingJob) => existingJob.id !== jobId),
      );
    },
    [setBackgroundJobs],
  );

  const updateJobStatus = useCallback(
    (
      jobId: string,
      updates: Partial<
        Pick<
          BackgroundJobData,
          | 'status'
          | 'processedItems'
          | 'successCount'
          | 'warningCount'
          | 'failureCount'
        >
      >,
    ) => {
      setBackgroundJobs((previousJobs) =>
        previousJobs.map((existingJob) =>
          existingJob.id === jobId
            ? { ...existingJob, ...updates }
            : existingJob,
        ),
      );
    },
    [setBackgroundJobs],
  );

  return { upsertJob, removeJob, updateJobStatus };
};

export const useBackgroundJobs = () => {
  return useAtomStateValue(backgroundJobsState);
};
