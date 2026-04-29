/**
 * Pure transform functions for converting raw XLSX cell values to typed values.
 * Extracted from parsers/ambetter.ts to be shared by the generic parser.
 */

import type { ParsedRow } from 'src/modules/reconciliation/parsers/xlsx';

// ---------------------------------------------------------------------------
// Column resolution
// ---------------------------------------------------------------------------

export const resolveColumn = (
  row: ParsedRow,
  aliases: string[],
): unknown | undefined => {
  for (const alias of aliases) {
    if (alias in row) {
      return row[alias];
    }
  }

  return undefined;
};

// ---------------------------------------------------------------------------
// Value transforms
// ---------------------------------------------------------------------------

export const toString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value).trim();
};

export const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const str = String(value).replace(/[$,]/g, '').trim();
  const num = Number(str);

  return isNaN(num) ? null : num;
};

export const toCurrency = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const str = String(value).replace(/[$,]/g, '').trim();
  const num = Number(str);

  return isNaN(num) ? null : num;
};

export const toDateString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    // xlsx library parses CSV dates as UTC midnight Date objects. Use UTC
    // parts so US timezones don't shift the day backwards.
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  const str = String(value).trim();

  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const m = month.padStart(2, '0');
    const d = day.padStart(2, '0');

    return `${year}-${m}-${d}`;
  }

  // MM/DD/YY or M/D/YY (2-digit year → 20YY)
  const shortSlashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);

  if (shortSlashMatch) {
    const [, month, day, yy] = shortSlashMatch;
    const m = month.padStart(2, '0');
    const d = day.padStart(2, '0');
    const year = `20${yy}`;

    return `${year}-${m}-${d}`;
  }

  // Excel serial number
  const serial = Number(str);

  if (!isNaN(serial) && serial > 1 && serial < 100000) {
    const date = new Date((serial - 25569) * 86400 * 1000);

    // Serial = days since epoch → use UTC parts to avoid timezone shifts
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  return null;
};

export const toBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const str = String(value).trim().toLowerCase();

  if (str === 'yes' || str === 'true' || str === '1') {
    return true;
  }

  if (str === 'no' || str === 'false' || str === '0') {
    return false;
  }

  return null;
};

// ---------------------------------------------------------------------------
// Transform registry — keyed by FieldDataType
// ---------------------------------------------------------------------------

export const TRANSFORMS: Record<
  string,
  (value: unknown) => string | number | boolean | null
> = {
  text: toString,
  date: toDateString,
  boolean: toBoolean,
  number: toNumber,
  currency: toCurrency,
};

// ---------------------------------------------------------------------------
// Data type inference from CRM field metadata type
// ---------------------------------------------------------------------------

export const inferDataType = (crmFieldType: string): string => {
  switch (crmFieldType) {
    case 'DATE_TIME':
    case 'DATE':
      return 'date';
    case 'NUMBER':
    case 'NUMERIC':
      return 'number';
    case 'CURRENCY':
      return 'currency';
    case 'BOOLEAN':
      return 'boolean';
    default:
      return 'text';
  }
};

// ---------------------------------------------------------------------------
// Computed fields (applied after initial parsing)
// ---------------------------------------------------------------------------

import type { ComputedFieldDef } from 'src/modules/reconciliation/types/reconciliation';

/**
 * Apply computed fields to a parsed row. Inputs are resolved in order:
 *   1. Direct key match in row (input IS a header name)
 *   2. Role lookup via fieldMapping (input is a role name like "brokerEffectiveDate")
 *
 * Skips computation entirely if no inputs can be resolved — prevents
 * null computed values from generating false diffs downstream.
 */
export const applyComputedFields = (
  row: Record<string, unknown>,
  computedFields: ComputedFieldDef[] | undefined | null,
  fieldMapping?: Record<string, string>,
): void => {
  if (!computedFields) return;

  for (const cf of computedFields) {
    // Skip non-computed entries (e.g., FieldConfigEntry without computation)
    if (!cf.inputs || !cf.method) continue;

    const inputValues = cf.inputs.map((inputKey) => {
      // Direct: input key is a header in the row
      if (inputKey in row) return row[inputKey] as string | number | boolean | null;

      // Role lookup: input key is a role in fieldMapping → resolve to header
      const header = fieldMapping?.[inputKey];

      if (header && header in row) return row[header] as string | number | boolean | null;

      return null;
    });

    // Skip if no inputs resolved — don't produce a null computed value
    if (inputValues.every((v) => v == null)) continue;

    const computation = COMPUTATIONS[cf.method];

    if (computation) {
      row[cf.outputKey] = computation(inputValues);
    }
  }
};

// ---------------------------------------------------------------------------
// Computation registry — keyed by ComputationMethod
// ---------------------------------------------------------------------------

export const COMPUTATIONS: Record<
  string,
  (inputs: (string | number | boolean | null)[]) => string | number | boolean | null
> = {
  maxDate: (inputs) => {
    const dates = inputs.filter((v): v is string => typeof v === 'string' && v.length > 0);

    if (dates.length === 0) return null;

    return dates.sort().pop()!;
  },

  minDate: (inputs) => {
    const dates = inputs.filter((v): v is string => typeof v === 'string' && v.length > 0);

    if (dates.length === 0) return null;

    return dates.sort().shift()!;
  },

  coalesce: (inputs) => {
    return inputs.find((v) => v != null) ?? null;
  },
};

// ---------------------------------------------------------------------------
// UTC date utilities (shared by status + diff engines)
// ---------------------------------------------------------------------------

/** Parse a YYYY-MM-DD string as UTC midnight, avoiding timezone shifts. */
export const parseUTCDate = (dateStr: string): Date =>
  new Date(dateStr + 'T00:00:00Z');

/** Days between two YYYY-MM-DD strings (signed: positive if b > a). */
export const daysBetweenUTC = (a: string, b: string): number => {
  const msPerDay = 1000 * 60 * 60 * 24;

  return Math.round(
    (parseUTCDate(b).getTime() - parseUTCDate(a).getTime()) / msPerDay,
  );
};

// ---------------------------------------------------------------------------
// Field mapping resolution (header format normalization)
// ---------------------------------------------------------------------------

/**
 * Resolve statusFieldMapping headers against actual file headers.
 * CarrierConfig stores canonical headers ("Broker Effective Date") but CSV
 * files use underscore headers ("broker_effective_date"). This normalizes
 * both sides so the mapping works regardless of file format.
 */
export const resolveFieldMapping = (
  fieldMapping: Record<string, string>,
  actualHeaders: string[],
): Record<string, string> => {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[\s_-]+/g, '');

  const headerByNormalized = new Map(
    actualHeaders.map((h) => [normalize(h), h]),
  );

  const resolved: Record<string, string> = {};

  for (const [role, configuredHeader] of Object.entries(fieldMapping)) {
    // Direct match — header exists exactly as configured
    if (actualHeaders.includes(configuredHeader)) {
      resolved[role] = configuredHeader;
      continue;
    }

    // Normalized match — "Broker Effective Date" ↔ "broker_effective_date"
    const match = headerByNormalized.get(normalize(configuredHeader));

    if (match) {
      resolved[role] = match;
      continue;
    }

    // Keep original (may be a computed field output key like "True Effective Date")
    resolved[role] = configuredHeader;
  }

  return resolved;
};
