import { useEffect } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { useImportJobPoller } from '@/spreadsheet-import/hooks/useImportJobPoller';
import { activeImportJobState } from '@/spreadsheet-import/states/activeImportJobState';
import { readStoredActiveImportJob } from '@/spreadsheet-import/utils/readStoredActiveImportJob';
import { writeStoredActiveImportJob } from '@/spreadsheet-import/utils/writeStoredActiveImportJob';
import { backgroundJobsState } from '@/ui/feedback/background-job-indicator/states/backgroundJobState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

export const ImportJobRecoveryEffect = () => {
  const isLogged = useIsLogged();
  const setActiveImportJob = useSetAtomState(activeImportJobState);
  const setBackgroundJobs = useSetAtomState(backgroundJobsState);

  useImportJobPoller();

  useEffect(() => {
    // Only imports post cards. A session that expires keeps the page, so the next user
    // to sign in on a shared machine would see this user's row errors (CSV values)
    if (!isLogged) {
      setBackgroundJobs([]);
      return;
    }

    const storedActiveImportJob = readStoredActiveImportJob();

    if (!isDefined(storedActiveImportJob)) {
      writeStoredActiveImportJob(null);
      return;
    }

    // No card yet: the poller posts one only when the requester-scoped importJob query
    // returns the job, so a job another user left in this browser never shows
    setActiveImportJob(storedActiveImportJob);
  }, [isLogged, setActiveImportJob, setBackgroundJobs]);

  return null;
};
