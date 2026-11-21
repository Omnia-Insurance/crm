import { isDefined } from 'twenty-shared/utils';

// Diff values are strings, null when empty; store values can be numbers or ''.
export const normalizeDiffComparableValue = (value: unknown): string | null =>
  isDefined(value) && value !== '' ? String(value) : null;
