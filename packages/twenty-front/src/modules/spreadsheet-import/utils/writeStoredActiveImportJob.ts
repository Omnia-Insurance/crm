import { isDefined } from 'twenty-shared/utils';

import { ACTIVE_IMPORT_JOB_STORAGE_KEY } from '@/spreadsheet-import/constants/ActiveImportJobStorageKey';
import { type ActiveImportJob } from '@/spreadsheet-import/states/activeImportJobState';

export const writeStoredActiveImportJob = (
  activeImportJob: ActiveImportJob | null,
) => {
  try {
    if (!isDefined(activeImportJob)) {
      localStorage.removeItem(ACTIVE_IMPORT_JOB_STORAGE_KEY);
      return;
    }

    const { importJobId, objectNameSingular, totalRecords } = activeImportJob;

    localStorage.setItem(
      ACTIVE_IMPORT_JOB_STORAGE_KEY,
      JSON.stringify({ importJobId, objectNameSingular, totalRecords }),
    );
  } catch {
    // Storage can be unavailable (private mode, quota): the import still runs,
    // it is only not picked up again after a reload
  }
};
