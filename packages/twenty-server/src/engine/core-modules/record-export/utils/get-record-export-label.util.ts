import { isNonEmptyString } from '@sniptt/guards';
import { isPlainObject } from 'twenty-shared/utils';

// A FULL_NAME label identifier exports as "First Last"
export const getRecordExportLabel = (labelValue: unknown): string => {
  if (isNonEmptyString(labelValue)) {
    return labelValue;
  }

  if (isPlainObject(labelValue)) {
    return [labelValue.firstName, labelValue.lastName]
      .filter(isNonEmptyString)
      .join(' ');
  }

  return '';
};
