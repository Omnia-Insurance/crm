/**
 * Pure transform functions for converting raw XLSX cell values to typed values.
 *
 * The transform vocabulary is per-carrier configurable (Phase 4.8 — audit
 * 2026-06-10 §"Transform vocabulary is hardcoded"): `buildTransforms(rules)`
 * builds the type → transform registry from a carrier's
 * `carrierConfig.transformRules` (validated by `parseCarrierPipelineConfig`),
 * with `DEFAULT_TRANSFORM_RULES` reproducing the historical hardcoded
 * behavior exactly. `TRANSFORMS` and the named `to*` exports are the
 * default-rules instances for callers with no carrier context.
 */

import type { ParsedRow } from 'src/modules/reconciliation/parsers/xlsx';

// ---------------------------------------------------------------------------
// Transform errors
// ---------------------------------------------------------------------------

/**
 * Thrown by value transforms when a NON-EMPTY raw value cannot be parsed.
 * The parse job's per-cell error machinery catches this, records the cell in
 * `parseErrors` (surfaced as `stats.parseErrors`), and preserves the raw
 * value on the row — bad data is counted loudly instead of silently
 * becoming null and driving wrong status derivations.
 */
export class TransformError extends Error {
  constructor(
    public readonly reason: string,
    public readonly raw: unknown,
  ) {
    super(`${reason} (raw value: ${JSON.stringify(raw)})`);
    this.name = 'TransformError';
  }
}

// ---------------------------------------------------------------------------
// Date parsing constants
// ---------------------------------------------------------------------------

/**
 * Two-digit-year pivot window. A 2-digit year `yy` resolves to 20yy when
 * 2000+yy is no more than TWO_DIGIT_YEAR_FUTURE_WINDOW years past the
 * current year; otherwise it resolves to 19yy. With current year 2026 and a
 * window of 10: '26' → 2026, '36' → 2036, '37' → 1937, '63' → 1963 — so a
 * DOB exported as '12/30/63' no longer becomes 2063.
 *
 * Per-carrier override: `transformRules.twoDigitYearPivot` (Phase 4.8).
 */
export const TWO_DIGIT_YEAR_FUTURE_WINDOW = 10;

/** Resolve a 2-digit year via the pivot window (see above). */
export const resolveTwoDigitYear = (
  yy: number,
  currentYear: number = new Date().getUTCFullYear(),
  futureWindow: number = TWO_DIGIT_YEAR_FUTURE_WINDOW,
): number => {
  const pivot = currentYear - 2000 + futureWindow;

  return yy > pivot ? 1900 + yy : 2000 + yy;
};

/**
 * 4-digit integers in this range are rejected as ambiguous in date columns:
 * they read equally as a calendar year ('2026') or an Excel serial
 * (serial 2026 = 1905-07-18). Every serial in this window decodes to a 1905
 * date — implausible for this domain — so the rejection costs nothing.
 */
const AMBIGUOUS_YEAR_MIN = 1900;
const AMBIGUOUS_YEAR_MAX = 2100;

/** Decoded Excel serials outside this year range are rejected as implausible. */
const MIN_PLAUSIBLE_DATE_YEAR = 1900;
const MAX_PLAUSIBLE_DATE_YEAR = 2100;

/** True when (year, month, day) is a real calendar date (UTC round-trip). */
const isValidCalendarDate = (
  year: number,
  month: number,
  day: number,
): boolean => {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  // JS Date rolls over out-of-range days (Feb 30 → Mar 2); round-trip check
  // rejects anything that rolled.
  const probe = new Date(Date.UTC(year, month - 1, day));

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
};

const formatIsoDate = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Per-carrier transform rules (Phase 4.8)
// ---------------------------------------------------------------------------

/** Supported slash-date interpretations for `transformRules.dateFormats`. */
export type TransformDateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY';

/**
 * Per-carrier transform vocabulary, stored on
 * `carrierConfig.transformRules` and validated by
 * `parseCarrierPipelineConfig` (types/carrier-config.ts). All keys optional —
 * `buildTransforms` merges them over DEFAULT_TRANSFORM_RULES.
 */
export type TransformRules = {
  /** Slash-date interpretation order ('1/2/2026' → Jan 2 vs Feb 1). Formats
   *  are tried in order; the first that yields a valid calendar date wins. */
  dateFormats?: TransformDateFormat[];
  /** 2-digit-year future window in years (see TWO_DIGIT_YEAR_FUTURE_WINDOW):
   *  yy resolves to 20yy when 2000+yy ≤ currentYear + pivot, else 19yy. */
  twoDigitYearPivot?: number;
  /** Tokens (case-insensitive) recognized as boolean true. */
  booleanTrue?: string[];
  /** Tokens (case-insensitive) recognized as boolean false. */
  booleanFalse?: string[];
  /** Symbols stripped from number/currency cells before parsing. */
  currencyStrip?: string[];
};

/** Historical hardcoded behavior, bit-identical (Ambetter-era defaults). */
export const DEFAULT_TRANSFORM_RULES: Required<TransformRules> = {
  dateFormats: ['MM/DD/YYYY'],
  twoDigitYearPivot: TWO_DIGIT_YEAR_FUTURE_WINDOW,
  booleanTrue: ['yes', 'true', '1'],
  booleanFalse: ['no', 'false', '0'],
  currencyStrip: ['$', ','],
};

const resolveTransformRules = (
  rules: TransformRules | null | undefined,
): Required<TransformRules> => ({
  dateFormats: rules?.dateFormats ?? DEFAULT_TRANSFORM_RULES.dateFormats,
  twoDigitYearPivot:
    rules?.twoDigitYearPivot ?? DEFAULT_TRANSFORM_RULES.twoDigitYearPivot,
  booleanTrue: rules?.booleanTrue ?? DEFAULT_TRANSFORM_RULES.booleanTrue,
  booleanFalse: rules?.booleanFalse ?? DEFAULT_TRANSFORM_RULES.booleanFalse,
  currencyStrip: rules?.currencyStrip ?? DEFAULT_TRANSFORM_RULES.currencyStrip,
});

const escapeRegExpChar = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Value transforms
// ---------------------------------------------------------------------------

export const toString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value).trim();
};

/**
 * Shared numeric grammar for number + currency columns: strips the
 * configured currency symbols (default $ and commas), understands
 * accounting-style negatives '(123.45)' and trailing-minus '123.45-'.
 * Throws TransformError on non-empty unparseable input.
 */
const parseNumericValue = (
  value: unknown,
  kind: string,
  stripRegex: RegExp | null,
): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TransformError(`Non-finite ${kind} value`, value);
    }

    return value;
  }

  let str = (
    stripRegex ? String(value).replace(stripRegex, '') : String(value)
  ).trim();

  let negative = false;
  const parenMatch = str.match(/^\((.+)\)$/);

  if (parenMatch) {
    // Accounting-style negative: (123.45)
    negative = true;
    str = parenMatch[1].trim();
  } else if (str.endsWith('-') && str.length > 1) {
    // Trailing-minus negative: 123.45-
    negative = true;
    str = str.slice(0, -1).trim();
  }

  const num = str === '' ? NaN : Number(str);

  if (Number.isNaN(num)) {
    throw new TransformError(`Unparseable ${kind}`, value);
  }

  return negative ? -num : num;
};

const buildNumericTransform = (
  kind: 'number' | 'currency',
  currencyStrip: string[],
): ((value: unknown) => number | null) => {
  const stripRegex =
    currencyStrip.length > 0
      ? new RegExp(currencyStrip.map(escapeRegExpChar).join('|'), 'g')
      : null;

  return (value: unknown): number | null =>
    parseNumericValue(value, kind, stripRegex);
};

const buildDateTransform = (
  dateFormats: TransformDateFormat[],
  twoDigitYearPivot: number,
): ((value: unknown) => string | null) => {
  /** Try each configured format in order; first valid calendar date wins. */
  const resolveSlashDate = (
    first: number,
    second: number,
    year: number,
  ): string | null => {
    for (const format of dateFormats) {
      const [month, day] =
        format === 'DD/MM/YYYY' ? [second, first] : [first, second];

      if (isValidCalendarDate(year, month, day)) {
        return formatIsoDate(year, month, day);
      }
    }

    return null;
  };

  const expectedFormats = (yearDigits: 2 | 4): string =>
    dateFormats
      .map((f) => (yearDigits === 2 ? f.replace('YYYY', 'YY') : f))
      .join(' or ');

  return (value: unknown): string | null => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new TransformError('Invalid Date object in date column', value);
      }

      // xlsx library parses CSV dates as UTC midnight Date objects. Use UTC
      // parts so US timezones don't shift the day backwards.
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, '0');
      const d = String(value.getUTCDate()).padStart(2, '0');

      return `${y}-${m}-${d}`;
    }

    const str = String(value).trim();

    if (str === '') {
      return null;
    }

    // YYYY-MM-DD already — still calendar-validated so a day/month swap like
    // '2025-31-12' fails loudly instead of passing through.
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (isoMatch) {
      const [, y, m, d] = isoMatch;

      if (!isValidCalendarDate(Number(y), Number(m), Number(d))) {
        throw new TransformError(`Invalid calendar date "${str}"`, value);
      }

      return str;
    }

    // Slash date with 4-digit year, interpreted per the carrier's
    // dateFormats (default MM/DD/YYYY, US order). Month/day are range +
    // calendar checked, so a DD/MM-formatted file ('31/12/2025') fed to an
    // MM/DD carrier becomes a parse error instead of the fabricated ISO
    // string '2025-31-12'.
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (slashMatch) {
      const resolved = resolveSlashDate(
        Number(slashMatch[1]),
        Number(slashMatch[2]),
        Number(slashMatch[3]),
      );

      if (resolved === null) {
        throw new TransformError(
          `Invalid month/day in date "${str}" (expected ${expectedFormats(4)})`,
          value,
        );
      }

      return resolved;
    }

    // Slash date with 2-digit year — resolved via the pivot window
    // (twoDigitYearPivot, default TWO_DIGIT_YEAR_FUTURE_WINDOW), not a
    // blanket 20YY.
    const shortSlashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);

    if (shortSlashMatch) {
      const year = resolveTwoDigitYear(
        Number(shortSlashMatch[3]),
        undefined,
        twoDigitYearPivot,
      );
      const resolved = resolveSlashDate(
        Number(shortSlashMatch[1]),
        Number(shortSlashMatch[2]),
        year,
      );

      if (resolved === null) {
        throw new TransformError(
          `Invalid month/day in date "${str}" (expected ${expectedFormats(2)})`,
          value,
        );
      }

      return resolved;
    }

    // Excel serial number.
    //
    // Cell-type info: parseXlsxSheet reads with raw:true, so XLSX numeric
    // date cells arrive here as `number` values while CSV cells always
    // arrive as strings — a `number` therefore plausibly IS a serial. Digit
    // strings are ambiguous (a year column exported as text vs. a serial
    // exported as text); they are still decoded for CSV compatibility
    // EXCEPT 4-digit integers in 1900–2100, which are rejected as ambiguous
    // years. Limitation: a genuine string serial in that window (all decode
    // to 1905 dates) cannot be distinguished from a year, so it becomes a
    // parse error.
    const serial = typeof value === 'number' ? value : Number(str);

    if (Number.isFinite(serial)) {
      if (
        Number.isInteger(serial) &&
        serial >= AMBIGUOUS_YEAR_MIN &&
        serial <= AMBIGUOUS_YEAR_MAX
      ) {
        throw new TransformError(
          `Ambiguous numeric date "${str}": reads as both a calendar year and an Excel serial`,
          value,
        );
      }

      const date = new Date((serial - 25569) * 86400 * 1000);
      // Serial = days since epoch → use UTC parts to avoid timezone shifts
      const y = date.getUTCFullYear();

      if (
        Number.isNaN(y) ||
        y < MIN_PLAUSIBLE_DATE_YEAR ||
        y > MAX_PLAUSIBLE_DATE_YEAR
      ) {
        throw new TransformError(
          `Excel serial ${serial} decodes to an implausible year (${y})`,
          value,
        );
      }

      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');

      return `${y}-${m}-${d}`;
    }

    throw new TransformError(`Unrecognized date format "${str}"`, value);
  };
};

const buildBooleanTransform = (
  booleanTrue: string[],
  booleanFalse: string[],
): ((value: unknown) => boolean | null) => {
  const trueTokens = new Set(booleanTrue.map((t) => t.toLowerCase()));
  const falseTokens = new Set(booleanFalse.map((t) => t.toLowerCase()));

  return (value: unknown): boolean | null => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    const str = String(value).trim().toLowerCase();

    if (str === '') {
      return null;
    }

    if (trueTokens.has(str)) {
      return true;
    }

    if (falseTokens.has(str)) {
      return false;
    }

    throw new TransformError(`Unrecognized boolean value "${str}"`, value);
  };
};

// ---------------------------------------------------------------------------
// Transform registry — keyed by FieldDataType, built per carrier
// ---------------------------------------------------------------------------

export type TransformFn = (value: unknown) => string | number | boolean | null;

/**
 * Build the type → transform registry for a carrier's transformRules.
 * Missing keys fall back to DEFAULT_TRANSFORM_RULES, so
 * `buildTransforms()` / `buildTransforms({})` ≡ TRANSFORMS.
 */
export const buildTransforms = (
  rules: TransformRules | null = null,
): Record<string, TransformFn> => {
  const resolved = resolveTransformRules(rules);

  return {
    text: toString,
    date: buildDateTransform(resolved.dateFormats, resolved.twoDigitYearPivot),
    boolean: buildBooleanTransform(resolved.booleanTrue, resolved.booleanFalse),
    number: buildNumericTransform('number', resolved.currencyStrip),
    currency: buildNumericTransform('currency', resolved.currencyStrip),
  };
};

/** Default-rules registry for callers with no carrier context. */
export const TRANSFORMS: Record<string, TransformFn> = buildTransforms(
  DEFAULT_TRANSFORM_RULES,
);

// Default-rules named transforms (historical API, used directly by tests
// and non-pipeline callers).
export const toNumber = buildNumericTransform(
  'number',
  DEFAULT_TRANSFORM_RULES.currencyStrip,
);

/**
 * Same grammar as toNumber; kept as a separate registry entry so
 * currency-specific behavior (micros conversion, currency codes) can
 * diverge later without touching plain number columns.
 */
export const toCurrency = buildNumericTransform(
  'currency',
  DEFAULT_TRANSFORM_RULES.currencyStrip,
);

export const toDateString = buildDateTransform(
  DEFAULT_TRANSFORM_RULES.dateFormats,
  DEFAULT_TRANSFORM_RULES.twoDigitYearPivot,
);

export const toBoolean = buildBooleanTransform(
  DEFAULT_TRANSFORM_RULES.booleanTrue,
  DEFAULT_TRANSFORM_RULES.booleanFalse,
);

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
      if (inputKey in row)
        return row[inputKey] as string | number | boolean | null;

      // Role lookup: input key is a role in fieldMapping → resolve to header
      const header = fieldMapping?.[inputKey];

      if (header && header in row)
        return row[header] as string | number | boolean | null;

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
  (
    inputs: (string | number | boolean | null)[],
  ) => string | number | boolean | null
> = {
  maxDate: (inputs) => {
    const dates = inputs.filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );

    if (dates.length === 0) return null;

    return dates.sort().pop()!;
  },

  minDate: (inputs) => {
    const dates = inputs.filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );

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
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

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

// ---------------------------------------------------------------------------
// Status-role mapping validation
// ---------------------------------------------------------------------------

/**
 * Status-engine roles that must resolve to a real input for derivations to
 * be trustworthy. Confirmed against deriveAmbetterStatus (engines/status.ts,
 * fed by buildStatusInputFromMapping in match.job): a null effectiveDate
 * blanket-defaults every row to ACTIVE_APPROVED, and a null paidThroughDate
 * blanket-derives PAYMENT_ERROR_* for every active row. termDate and
 * eligibleForCommission are legitimately null per row, so an unresolved
 * header for those only warns.
 */
export const REQUIRED_STATUS_ENGINE_ROLES: readonly string[] = [
  'effectiveDate',
  'paidThroughDate',
];

export type UnresolvedStatusRole = {
  role: string;
  configuredHeader: string;
};

export type StatusRoleValidationResult = {
  unresolvedRequired: UnresolvedStatusRole[];
  unresolvedOptional: UnresolvedStatusRole[];
};

/**
 * Validate a resolved status fieldMapping (output of resolveFieldMapping):
 * every configured role must point at either an actual file header or a
 * computed-field output key. resolveFieldMapping keeps the configured header
 * verbatim when nothing matches (needed for computed output keys), which
 * also swallows genuine misconfigurations — e.g. a carrier renaming
 * 'Paid Through Date' to 'Paid Thru' silently feeds null into the status
 * engine. This surfaces those: callers should fail the run for
 * unresolvedRequired roles and log loudly for unresolvedOptional ones.
 */
export const validateStatusRoleMapping = (
  resolvedMapping: Record<string, string>,
  actualHeaders: string[],
  computedFields: ComputedFieldDef[] | null | undefined,
): StatusRoleValidationResult => {
  const headerSet = new Set(actualHeaders);
  const computedOutputKeys = new Set(
    (computedFields ?? [])
      .filter((cf) => cf.outputKey && cf.method)
      .map((cf) => cf.outputKey),
  );

  const unresolvedRequired: UnresolvedStatusRole[] = [];
  const unresolvedOptional: UnresolvedStatusRole[] = [];

  for (const [role, header] of Object.entries(resolvedMapping)) {
    if (headerSet.has(header) || computedOutputKeys.has(header)) {
      continue;
    }

    const unresolved = { role, configuredHeader: header };

    if (REQUIRED_STATUS_ENGINE_ROLES.includes(role)) {
      unresolvedRequired.push(unresolved);
    } else {
      unresolvedOptional.push(unresolved);
    }
  }

  return { unresolvedRequired, unresolvedOptional };
};

// ---------------------------------------------------------------------------
// Row transform stage (extracted from parse.job for testability)
// ---------------------------------------------------------------------------

export type CellParseError = {
  rowNumber: number;
  header?: string;
  error: string;
};

export type TransformRowsResult = {
  normalized: Record<string, unknown>[];
  parseErrors: CellParseError[];
};

/**
 * Apply per-header type transforms + computed fields to raw parsed rows.
 *
 * A cell whose transform throws (TransformError on non-empty unparseable
 * input) is recorded in `parseErrors` and keeps its RAW value in the output
 * row — one bad cell never drops a row, but the failure is counted
 * (surfaced as stats.parseErrors) instead of silently becoming null.
 *
 * `transformRules` is the carrier's validated transform vocabulary
 * (Phase 4.8); omitted/null means DEFAULT_TRANSFORM_RULES behavior.
 */
export const transformRows = (
  rawRows: ParsedRow[],
  headerTypes: Map<string, string>,
  computedFields: ComputedFieldDef[] | null,
  statusFieldMapping: Record<string, string>,
  policyNumberHeader?: string,
  transformRules?: TransformRules | null,
): TransformRowsResult => {
  const transforms = transformRules
    ? buildTransforms(transformRules)
    : TRANSFORMS;
  const normalized: Record<string, unknown>[] = [];
  const parseErrors: CellParseError[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];

    try {
      const row: Record<string, unknown> = {};

      for (const [header, rawValue] of Object.entries(raw)) {
        try {
          const dataType = headerTypes.get(header);

          if (dataType) {
            const transform = transforms[dataType];

            row[header] = transform ? transform(rawValue) : rawValue;
          } else {
            row[header] = rawValue;
          }
        } catch (cellError) {
          parseErrors.push({
            rowNumber: i + 1,
            header,
            error:
              cellError instanceof Error
                ? cellError.message
                : String(cellError),
          });
          row[header] = rawValue; // preserve raw value on failure
        }
      }

      // Apply computed fields — resolve inputs via statusFieldMapping
      // so role names like "brokerEffectiveDate" find the actual header
      applyComputedFields(row, computedFields, statusFieldMapping);

      // Add metadata
      row.__rowNumber = i + 1;

      const policyNum = policyNumberHeader ? row[policyNumberHeader] : null;

      row.__name = policyNum ? `${policyNum} - row ${i + 1}` : `row ${i + 1}`;

      normalized.push(row);
    } catch (rowError) {
      parseErrors.push({
        rowNumber: i + 1,
        error: rowError instanceof Error ? rowError.message : String(rowError),
      });
    }
  }

  return { normalized, parseErrors };
};
