import { isNonEmptyString, isNonNegativeInteger } from '@sniptt/guards';
import { isPlainObject } from 'twenty-shared/utils';

import { ACTIVE_IMPORT_JOB_STORAGE_KEY } from '@/spreadsheet-import/constants/ActiveImportJobStorageKey';
import { type ActiveImportJob } from '@/spreadsheet-import/states/activeImportJobState';

export const readStoredActiveImportJob = (): ActiveImportJob | null => {
  try {
    const storedValue = localStorage.getItem(ACTIVE_IMPORT_JOB_STORAGE_KEY);

    if (!isNonEmptyString(storedValue)) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(storedValue);

    if (
      !isPlainObject(parsedValue) ||
      !isNonEmptyString(parsedValue.importJobId) ||
      !isNonEmptyString(parsedValue.objectNameSingular) ||
      !isNonNegativeInteger(parsedValue.totalRecords)
    ) {
      return null;
    }

    return {
      importJobId: parsedValue.importJobId,
      objectNameSingular: parsedValue.objectNameSingular,
      totalRecords: parsedValue.totalRecords,
    };
  } catch {
    return null;
  }
};
