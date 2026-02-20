import { parsePhoneNumber } from 'libphonenumber-js';
import { isDefined } from 'twenty-shared/utils';

import { type FieldTransform } from 'src/engine/metadata-modules/ingestion-pipeline/types/field-transform.type';

// Applies a transform to a raw value from the source data.
// Returns the transformed value, or the original if no transform applies.
export const applyFieldTransform = (
  value: unknown,
  transform: FieldTransform | null,
): unknown => {
  if (!isDefined(transform)) {
    return value;
  }

  switch (transform.type) {
    case 'phoneNormalize':
      return normalizePhone(value);
    case 'map':
      return applyMap(value, transform.values);
    case 'uppercase':
      return typeof value === 'string' ? value.toUpperCase() : value;
    case 'lowercase':
      return typeof value === 'string' ? value.toLowerCase() : value;
    case 'trim':
      return typeof value === 'string' ? value.trim() : value;
    case 'dateFormat':
      return parseDateValue(value, transform.sourceFormat);
    case 'numberScale':
      return applyNumberScale(value, transform.multiplier);
    case 'sanitizeNull':
      return sanitizeNull(value);
    case 'static':
      return transform.value;
    default:
      return value;
  }
};

const normalizePhone = (value: unknown): string | unknown => {
  if (typeof value !== 'string' || value.trim() === '') {
    return value;
  }

  try {
    const phone = parsePhoneNumber(value, 'US');

    if (phone) {
      return phone.format('E.164');
    }

    return value;
  } catch {
    return value;
  }
};

const applyMap = (
  value: unknown,
  values: Record<string, string>,
): string | unknown => {
  const stringValue = String(value);

  return values[stringValue] ?? value;
};

const parseDateValue = (value: unknown, sourceFormat: string): string | unknown => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return value;
  }

  // Handle unix timestamps
  if (sourceFormat === 'unix') {
    const timestamp =
      typeof value === 'number' ? value : parseInt(String(value), 10);

    if (!isNaN(timestamp)) {
      return new Date(timestamp * 1000).toISOString();
    }

    return value;
  }

  if (sourceFormat === 'unix_ms') {
    const timestamp =
      typeof value === 'number' ? value : parseInt(String(value), 10);

    if (!isNaN(timestamp)) {
      return new Date(timestamp).toISOString();
    }

    return value;
  }

  // For standard date strings, attempt to parse directly
  const date = new Date(String(value));

  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  return value;
};

const applyNumberScale = (
  value: unknown,
  multiplier: number,
): number | unknown => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (isNaN(num)) {
    return value;
  }

  return Math.round(num * multiplier);
};

const sanitizeNull = (value: unknown): unknown => {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    value === 'null' ||
    value === 'NULL' ||
    value === 'None' ||
    value === 'none' ||
    value === 'undefined'
  ) {
    return null;
  }

  return value;
};
