import { Temporal } from 'temporal-polyfill';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isDateWithoutTime } from 'twenty-shared/utils';

// Legacy or imported DATE_TIME values can be date-only or malformed, and
// Temporal.Instant.from throws on both; a date-only value means midnight UTC
export const toTemporalInstantOrNull = (
  value: string,
): Temporal.Instant | null => {
  try {
    return Temporal.Instant.from(
      isDateWithoutTime(value) ? doNotTranslate(`${value}T00:00:00Z`) : value,
    );
  } catch {
    return null;
  }
};
