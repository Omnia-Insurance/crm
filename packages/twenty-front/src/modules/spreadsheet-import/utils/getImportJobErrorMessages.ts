import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { type ImportJobSummary } from '@/spreadsheet-import/types/ImportJobSummary';

export const getImportJobErrorMessages = (
  result: ImportJobSummary['result'],
): string[] => {
  const importJobErrors = result?.errors;

  if (!isNonEmptyArray(importJobErrors)) {
    return [];
  }

  return importJobErrors.map(
    (importJobError) =>
      [importJobError.message, importJobError.error].find(isNonEmptyString) ??
      t`Unknown error`,
  );
};
