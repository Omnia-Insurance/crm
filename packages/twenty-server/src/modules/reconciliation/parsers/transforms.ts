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
// Per-carrier transform rules (Phase 4.8; date grammar generalized OMN-12)
// ---------------------------------------------------------------------------

/**
 * Supported date-format tokens for `transformRules.dateFormats` (OMN-12
 * parse vocabulary — audit 2026-06-11 §"Date grammar is fixed beyond slash
 * order"). Numeric tokens pair a separator ('/' or '-') with a component
 * order; the two written-month tokens accept English month names (3-letter
 * abbreviations or full names, case-insensitive, optional comma — 'Jan 5
 * 2026', 'Jan 5, 2026', '05-JAN-2026'). Tokens are tried in configured
 * order; the boundary (types/carrier-config.ts) hard-fails unknown tokens,
 * mirroring the computed-field method fail-fast.
 */
export const TRANSFORM_DATE_FORMATS = [
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'MM-DD-YYYY',
  'DD-MM-YYYY',
  'MMM D YYYY',
  'D MMM YYYY',
] as const;

export type TransformDateFormat = (typeof TRANSFORM_DATE_FORMATS)[number];

/**
 * Per-carrier transform vocabulary, stored on
 * `carrierConfig.transformRules` and validated by
 * `parseCarrierPipelineConfig` (types/carrier-config.ts). All keys optional —
 * `buildTransforms` merges them over DEFAULT_TRANSFORM_RULES.
 */
export type TransformRules = {
  /** Date-format tokens (TRANSFORM_DATE_FORMATS), tried in order; the first
   *  that matches the cell's shape AND yields a valid calendar date wins
   *  ('1/2/2026' → Jan 2 vs Feb 1). The strict ISO YYYY-MM-DD fast path and
   *  the Excel-serial path are always active regardless of this list. */
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

// --- Date-format token compilation (OMN-12 token grammar) -----------------

/** English month names (3-letter abbreviations + full names) for the
 *  written-month tokens. Lookup is case-insensitive. */
const WRITTEN_MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * A compiled shape matcher: returns the ISO date when the trimmed string
 * matches the shape AND yields a valid calendar date, throws TransformError
 * when the shape matches but no interpretation is a real date (preserving
 * the historical "shape matched ⇒ no serial fallback" semantics), and
 * returns null when the shape does not match (next matcher is tried).
 */
type DateShapeMatcher = (str: string, value: unknown) => string | null;

/** Numeric day-month tokens, grouped by separator. Order within a group is
 *  the configured interpretation order (MM/DD vs DD/MM). */
const YEAR_LAST_NUMERIC_TOKENS: Partial<
  Record<TransformDateFormat, { separator: '/' | '-'; dayFirst: boolean }>
> = {
  'MM/DD/YYYY': { separator: '/', dayFirst: false },
  'DD/MM/YYYY': { separator: '/', dayFirst: true },
  'MM-DD-YYYY': { separator: '-', dayFirst: false },
  'DD-MM-YYYY': { separator: '-', dayFirst: true },
};

const YEAR_FIRST_NUMERIC_TOKENS: Partial<
  Record<TransformDateFormat, { separator: '/' | '-' }>
> = {
  'YYYY/MM/DD': { separator: '/' },
  'YYYY-MM-DD': { separator: '-' },
};

/**
 * Compile the configured token list into ordered shape matchers. Tokens
 * sharing a shape (e.g. MM/DD/YYYY + DD/MM/YYYY) collapse into ONE matcher
 * at the first token's position, trying the interpretations in configured
 * order — exactly the historical resolveSlashDate behavior. Year-last
 * numeric shapes also get the historical 2-digit-year variant (pivot
 * window); year-first and written-month shapes are 4-digit-year only.
 */
const compileDateMatchers = (
  dateFormats: TransformDateFormat[],
  twoDigitYearPivot: number,
): DateShapeMatcher[] => {
  const matchers: DateShapeMatcher[] = [];
  const compiledShapes = new Set<string>();

  const pushYearLastNumeric = (separator: '/' | '-'): void => {
    const formats = dateFormats.filter(
      (f) => YEAR_LAST_NUMERIC_TOKENS[f]?.separator === separator,
    );
    const sep = escapeRegExpChar(separator);
    const fourDigit = new RegExp(`^(\\d{1,2})${sep}(\\d{1,2})${sep}(\\d{4})$`);
    const twoDigit = new RegExp(`^(\\d{1,2})${sep}(\\d{1,2})${sep}(\\d{2})$`);

    const expectedFormats = (yearDigits: 2 | 4): string =>
      formats
        .map((f) => (yearDigits === 2 ? f.replace('YYYY', 'YY') : f))
        .join(' or ');

    /** Try each configured format in order; first valid calendar date wins. */
    const resolveDayMonth = (
      first: number,
      second: number,
      year: number,
    ): string | null => {
      for (const format of formats) {
        const [month, day] = YEAR_LAST_NUMERIC_TOKENS[format]?.dayFirst
          ? [second, first]
          : [first, second];

        if (isValidCalendarDate(year, month, day)) {
          return formatIsoDate(year, month, day);
        }
      }

      return null;
    };

    matchers.push((str, value) => {
      const match = str.match(fourDigit);

      if (!match) return null;

      const resolved = resolveDayMonth(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
      );

      if (resolved === null) {
        throw new TransformError(
          `Invalid month/day in date "${str}" (expected ${expectedFormats(4)})`,
          value,
        );
      }

      return resolved;
    });

    // 2-digit year — resolved via the pivot window (twoDigitYearPivot),
    // not a blanket 20YY. Historical behavior for slash tokens; extended
    // symmetrically to the dash tokens.
    matchers.push((str, value) => {
      const match = str.match(twoDigit);

      if (!match) return null;

      const year = resolveTwoDigitYear(
        Number(match[3]),
        undefined,
        twoDigitYearPivot,
      );
      const resolved = resolveDayMonth(
        Number(match[1]),
        Number(match[2]),
        year,
      );

      if (resolved === null) {
        throw new TransformError(
          `Invalid month/day in date "${str}" (expected ${expectedFormats(2)})`,
          value,
        );
      }

      return resolved;
    });
  };

  const pushYearFirstNumeric = (
    token: TransformDateFormat,
    separator: '/' | '-',
  ): void => {
    const sep = escapeRegExpChar(separator);
    // Relaxed 1-2 digit month/day; the strict ISO fast path (always active)
    // handles zero-padded YYYY-MM-DD before any matcher runs.
    const shape = new RegExp(`^(\\d{4})${sep}(\\d{1,2})${sep}(\\d{1,2})$`);

    matchers.push((str, value) => {
      const match = str.match(shape);

      if (!match) return null;

      const [, y, m, d] = match;

      if (!isValidCalendarDate(Number(y), Number(m), Number(d))) {
        throw new TransformError(
          `Invalid month/day in date "${str}" (expected ${token})`,
          value,
        );
      }

      return formatIsoDate(Number(y), Number(m), Number(d));
    });
  };

  const pushWrittenMonth = (token: 'MMM D YYYY' | 'D MMM YYYY'): void => {
    const shape =
      token === 'MMM D YYYY'
        ? /^([A-Za-z]+)[\s,.-]+(\d{1,2})[\s,.-]+(\d{4})$/
        : /^(\d{1,2})[\s,.-]+([A-Za-z]+)[\s,.-]+(\d{4})$/;

    matchers.push((str, value) => {
      const match = str.match(shape);

      if (!match) return null;

      const [monthWord, dayStr] =
        token === 'MMM D YYYY' ? [match[1], match[2]] : [match[2], match[1]];
      const month = WRITTEN_MONTHS[monthWord.toLowerCase()];

      // Not an English month word — not this shape; keep falling through
      // (ends at the final "Unrecognized date format" throw).
      if (month === undefined) return null;

      const day = Number(dayStr);
      const year = Number(match[3]);

      if (!isValidCalendarDate(year, month, day)) {
        throw new TransformError(
          `Invalid month/day in date "${str}" (expected ${token})`,
          value,
        );
      }

      return formatIsoDate(year, month, day);
    });
  };

  for (const token of dateFormats) {
    const yearLast = YEAR_LAST_NUMERIC_TOKENS[token];
    const yearFirst = YEAR_FIRST_NUMERIC_TOKENS[token];
    const shapeKey = yearLast ? `year-last:${yearLast.separator}` : token;

    if (compiledShapes.has(shapeKey)) continue;
    compiledShapes.add(shapeKey);

    if (yearLast) {
      pushYearLastNumeric(yearLast.separator);
    } else if (yearFirst) {
      pushYearFirstNumeric(token, yearFirst.separator);
    } else {
      pushWrittenMonth(token as 'MMM D YYYY' | 'D MMM YYYY');
    }
  }

  return matchers;
};

const buildDateTransform = (
  dateFormats: TransformDateFormat[],
  twoDigitYearPivot: number,
): ((value: unknown) => string | null) => {
  const matchers = compileDateMatchers(dateFormats, twoDigitYearPivot);

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

    // Configured date-format tokens, compiled to shape matchers (default
    // ['MM/DD/YYYY'], US slash order — bit-identical to the historical
    // hardcoded slash handling). Month/day are range + calendar checked, so
    // a DD/MM-formatted file ('31/12/2025') fed to an MM/DD carrier becomes
    // a parse error instead of the fabricated ISO string '2025-31-12'; a
    // shape that matches with no valid interpretation throws rather than
    // falling through to the serial path.
    for (const matcher of matchers) {
      const resolved = matcher(str, value);

      if (resolved !== null) {
        return resolved;
      }
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

export type ComputationValue = string | number | boolean | null;

/**
 * Per-row context passed to every computation (OMN-12 vocabulary
 * expansion). `params` is the def's boundary-validated method params;
 * `resolveKey` resolves a row key the same way computed-field inputs
 * resolve (direct header first, then status-role lookup via fieldMapping) —
 * used by 'conditional' to read its `if.column` cell.
 */
export type ComputationContext = {
  params?: Record<string, unknown>;
  resolveKey: (key: string) => ComputationValue;
};

/** `then`/`else` of 'conditional': `'$<n>'` (1-based input ref) or a JSON
 *  literal. A literal string can therefore not look like '$1' — use an
 *  input pointing at a constant column instead. */
const INPUT_REF_PATTERN = /^\$(\d+)$/;

const resolveValueRef = (
  ref: unknown,
  inputs: ComputationValue[],
): ComputationValue => {
  if (typeof ref === 'string') {
    const match = ref.match(INPUT_REF_PATTERN);

    if (match) {
      return inputs[Number(match[1]) - 1] ?? null;
    }

    return ref;
  }

  if (typeof ref === 'number' || typeof ref === 'boolean' || ref === null) {
    return ref;
  }

  return null;
};

/**
 * Apply computed fields to a parsed row. Inputs are resolved in order:
 *   1. Direct key match in row (input IS a header name)
 *   2. Role lookup via fieldMapping (input is a role name like "brokerEffectiveDate")
 *
 * Skips computation entirely if no inputs can be resolved — prevents
 * null computed values from generating false diffs downstream. (This also
 * applies to 'conditional'/'arithmetic': declare at least one resolvable
 * input or the field never computes.)
 */
export const applyComputedFields = (
  row: Record<string, unknown>,
  computedFields: ComputedFieldDef[] | undefined | null,
  fieldMapping?: Record<string, string>,
): void => {
  if (!computedFields) return;

  const resolveKey = (key: string): ComputationValue => {
    // Direct: key is a header in the row
    if (key in row) return row[key] as ComputationValue;

    // Role lookup: key is a role in fieldMapping → resolve to header
    const header = fieldMapping?.[key];

    if (header && header in row) return row[header] as ComputationValue;

    return null;
  };

  for (const cf of computedFields) {
    // Skip non-computed entries (e.g., FieldConfigEntry without computation)
    if (!cf.inputs || !cf.method) continue;

    const inputValues = cf.inputs.map(resolveKey);

    // Skip if no inputs resolved — don't produce a null computed value
    if (inputValues.every((v) => v == null)) continue;

    const computation = COMPUTATIONS[cf.method];

    if (computation) {
      row[cf.outputKey] = computation(inputValues, {
        params: cf.params,
        resolveKey,
      });
    }
  }
};

// ---------------------------------------------------------------------------
// Safe arithmetic expression evaluator (OMN-12 'arithmetic' method — NO eval)
// ---------------------------------------------------------------------------

/** Thrown by compileArithmeticExpr on a malformed expression; the config
 *  boundary surfaces the message as a CarrierConfigValidationError problem. */
export class ArithmeticExprError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArithmeticExprError';
  }
}

type ArithmeticNode =
  | { kind: 'number'; value: number }
  | { kind: 'ref'; index: number } // 0-based into inputs
  | { kind: 'unary'; operand: ArithmeticNode }
  | {
      kind: 'binary';
      op: '+' | '-' | '*' | '/';
      left: ArithmeticNode;
      right: ArithmeticNode;
    };

type ArithmeticToken =
  | { kind: 'number'; value: number }
  | { kind: 'ref'; index: number }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

const GRAMMAR_HINT =
  'allowed: input refs ($1, $2, …), numeric literals, + - * /, parentheses';

const tokenizeArithmeticExpr = (expr: string): ArithmeticToken[] => {
  const tokens: ArithmeticToken[] = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }

    if (char === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }

    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ kind: 'op', op: char });
      i++;
      continue;
    }

    if (char === '$') {
      const match = expr.slice(i).match(/^\$(\d+)/);

      if (!match || Number(match[1]) < 1) {
        throw new ArithmeticExprError(
          `invalid input ref at position ${i + 1} — refs are $1, $2, … (1-based)`,
        );
      }

      tokens.push({ kind: 'ref', index: Number(match[1]) - 1 });
      i += match[0].length;
      continue;
    }

    if (/\d/.test(char)) {
      const match = expr.slice(i).match(/^\d+(\.\d+)?/);

      tokens.push({ kind: 'number', value: Number(match![0]) });
      i += match![0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      throw new ArithmeticExprError(
        `identifiers/functions are not allowed (found "${char}" at position ${i + 1}) — ${GRAMMAR_HINT}`,
      );
    }

    throw new ArithmeticExprError(
      `unexpected character "${char}" at position ${i + 1} — ${GRAMMAR_HINT}`,
    );
  }

  return tokens;
};

/**
 * Compile a tiny arithmetic grammar (input refs, numeric literals, + - * /,
 * parentheses, unary minus) into an evaluator. Recursive descent over an
 * explicit token list — no eval, no Function, no identifier support, so a
 * config value can never execute code.
 *
 * Evaluation semantics: refs resolve their input to a number (numbers pass
 * through; numeric strings are Number()-coerced); a null/missing/
 * non-numeric input, division by zero, or non-finite result yields null for
 * the whole expression (computed cell stays null rather than NaN/Infinity).
 */
export const compileArithmeticExpr = (
  expr: string,
): {
  evaluate: (inputs: ComputationValue[]) => number | null;
  /** Highest 1-based input ref in the expression (0 = no refs). */
  maxInputRef: number;
} => {
  const tokens = tokenizeArithmeticExpr(expr);
  let position = 0;
  let maxInputRef = 0;

  const peek = (): ArithmeticToken | undefined => tokens[position];

  const parseFactor = (): ArithmeticNode => {
    const token = peek();

    if (!token) {
      throw new ArithmeticExprError(
        `unexpected end of expression — ${GRAMMAR_HINT}`,
      );
    }

    if (token.kind === 'op' && token.op === '-') {
      position++;

      return { kind: 'unary', operand: parseFactor() };
    }

    if (token.kind === 'number') {
      position++;

      return { kind: 'number', value: token.value };
    }

    if (token.kind === 'ref') {
      position++;
      maxInputRef = Math.max(maxInputRef, token.index + 1);

      return { kind: 'ref', index: token.index };
    }

    if (token.kind === 'lparen') {
      position++;
      const inner = parseExpr();
      const closing = peek();

      if (!closing || closing.kind !== 'rparen') {
        throw new ArithmeticExprError('missing closing parenthesis');
      }
      position++;

      return inner;
    }

    throw new ArithmeticExprError(
      `unexpected token in expression — ${GRAMMAR_HINT}`,
    );
  };

  const parseTerm = (): ArithmeticNode => {
    let node = parseFactor();
    let token = peek();

    while (token?.kind === 'op' && (token.op === '*' || token.op === '/')) {
      position++;
      node = { kind: 'binary', op: token.op, left: node, right: parseFactor() };
      token = peek();
    }

    return node;
  };

  const parseExpr = (): ArithmeticNode => {
    let node = parseTerm();
    let token = peek();

    while (token?.kind === 'op' && (token.op === '+' || token.op === '-')) {
      position++;
      node = { kind: 'binary', op: token.op, left: node, right: parseTerm() };
      token = peek();
    }

    return node;
  };

  const root = parseExpr();

  if (position < tokens.length) {
    throw new ArithmeticExprError(
      `unexpected trailing tokens in expression — ${GRAMMAR_HINT}`,
    );
  }

  const toNumeric = (value: ComputationValue): number | null => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const num = Number(value.trim());

      return Number.isFinite(num) ? num : null;
    }

    return null;
  };

  const evaluateNode = (
    node: ArithmeticNode,
    inputs: ComputationValue[],
  ): number | null => {
    switch (node.kind) {
      case 'number':
        return node.value;
      case 'ref':
        return toNumeric(inputs[node.index] ?? null);
      case 'unary': {
        const operand = evaluateNode(node.operand, inputs);

        return operand === null ? null : -operand;
      }
      case 'binary': {
        const left = evaluateNode(node.left, inputs);
        const right = evaluateNode(node.right, inputs);

        if (left === null || right === null) return null;
        if (node.op === '/' && right === 0) return null;

        const result =
          node.op === '+'
            ? left + right
            : node.op === '-'
              ? left - right
              : node.op === '*'
                ? left * right
                : left / right;

        return Number.isFinite(result) ? result : null;
      }
    }
  };

  return {
    evaluate: (inputs) => evaluateNode(root, inputs),
    maxInputRef,
  };
};

/** Per-process compile cache: configs hold a handful of exprs; transformRows
 *  calls applyComputedFields once per row. */
const compiledArithmeticByExpr = new Map<
  string,
  ReturnType<typeof compileArithmeticExpr>
>();

const getCompiledArithmetic = (
  expr: string,
): ReturnType<typeof compileArithmeticExpr> | null => {
  const cached = compiledArithmeticByExpr.get(expr);

  if (cached) return cached;

  try {
    const compiled = compileArithmeticExpr(expr);

    compiledArithmeticByExpr.set(expr, compiled);

    return compiled;
  } catch {
    // Defensive only: the boundary fail-fasts malformed exprs before a run.
    return null;
  }
};

// ---------------------------------------------------------------------------
// Computation registry — keyed by ComputationMethod
// ---------------------------------------------------------------------------

export const COMPUTATIONS: Record<
  string,
  (inputs: ComputationValue[], context: ComputationContext) => ComputationValue
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

  /** First non-null input. NOTE: '' and whitespace-only strings ARE
   *  returned (they are != null) — use 'firstNonEmpty' to skip them. */
  coalesce: (inputs) => {
    return inputs.find((v) => v != null) ?? null;
  },

  /** First input that is neither null nor an empty/whitespace-only string
   *  (string winners are returned trimmed). Differs from 'coalesce', which
   *  returns '' / '  ' verbatim. */
  firstNonEmpty: (inputs) => {
    for (const v of inputs) {
      if (v === null || v === undefined) continue;

      if (typeof v === 'string') {
        const trimmed = v.trim();

        if (trimmed === '') continue;

        return trimmed;
      }

      return v;
    }

    return null;
  },

  /** String-join of the non-empty inputs with params.separator (default '').
   *  Null/empty inputs are skipped; all-empty yields null. */
  concat: (inputs, context) => {
    const separator =
      typeof context.params?.separator === 'string'
        ? context.params.separator
        : '';
    const parts = inputs
      .filter((v): v is string | number | boolean => v != null)
      .map((v) => String(v).trim())
      .filter((s) => s.length > 0);

    if (parts.length === 0) return null;

    return parts.join(separator);
  },

  /** params: { if: { column, op, value? }, then, else } — op shares the
   *  row-filter vocabulary (ROW_FILTER_OPS); then/else are '$<n>' input
   *  refs or JSON literals. The if.column resolves like an input (header or
   *  status-role name). */
  conditional: (inputs, context) => {
    const params = context.params;
    const condition = params?.if as
      | { column: string; op: RowFilterOp; value?: string }
      | undefined;

    // Defensive only: the boundary fail-fasts malformed params before a run.
    if (
      !params ||
      !condition ||
      typeof condition.column !== 'string' ||
      !ROW_FILTER_OPS.includes(condition.op)
    ) {
      return null;
    }

    const cellValue = context.resolveKey(condition.column);
    const branch = evaluateRowFilterOp(cellValue, condition.op, condition.value)
      ? params.then
      : params.else;

    return resolveValueRef(branch, inputs);
  },

  /** params: { expr } — safe arithmetic over input refs ($1, $2, …),
   *  numeric literals, + - * /, parentheses. See compileArithmeticExpr. */
  arithmetic: (inputs, context) => {
    const expr =
      typeof context.params?.expr === 'string' ? context.params.expr : null;

    if (expr === null) return null;

    const compiled = getCompiledArithmetic(expr);

    return compiled ? compiled.evaluate(inputs) : null;
  },
};

/** Canonical computed-field method ids — the config boundary
 *  (types/carrier-config.ts) hard-fails fieldConfig entries whose method is
 *  not in this list, since `applyComputedFields` would silently skip them. */
export const COMPUTATION_METHOD_IDS: readonly string[] =
  Object.keys(COMPUTATIONS);

// ---------------------------------------------------------------------------
// Computed-field params validation (boundary helper, OMN-12)
// ---------------------------------------------------------------------------

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** then/else problems for 'conditional': input ref bounds or literal type. */
const valueRefProblems = (
  ref: unknown,
  inputCount: number,
  label: string,
): string[] => {
  if (typeof ref === 'string') {
    const match = ref.match(INPUT_REF_PATTERN);

    if (match) {
      const index = Number(match[1]);

      if (index < 1 || index > inputCount) {
        return [
          `${label} references input $${index} but only ${inputCount} input(s) are declared`,
        ];
      }
    }

    return [];
  }

  if (typeof ref === 'number' || typeof ref === 'boolean' || ref === null) {
    return [];
  }

  return [
    `${label} must be an input ref ("$1") or a JSON literal (string/number/boolean/null)`,
  ];
};

/**
 * Per-method validation of `ComputedFieldDef.params` (OMN-12). Methods that
 * take no params reject a non-empty params object; 'concat' allows only an
 * optional string separator; 'conditional' requires { if, then, else } with
 * the row-filter op vocabulary; 'arithmetic' requires a compilable expr
 * whose refs stay within the declared inputs. Returns problem strings; the
 * boundary hard-fails on any (CarrierConfigValidationError), and the
 * validateCarrierConfig resolver replays the same chain.
 *
 * Unknown methods return no problems here — they are reported separately
 * against COMPUTATION_METHOD_IDS.
 */
export const validateComputedFieldParams = (
  def: Pick<ComputedFieldDef, 'method' | 'inputs' | 'params'>,
): string[] => {
  const problems: string[] = [];
  const params = def.params;
  const inputCount = def.inputs?.length ?? 0;

  switch (def.method) {
    case 'maxDate':
    case 'minDate':
    case 'coalesce':
    case 'firstNonEmpty': {
      if (params !== undefined && Object.keys(params).length > 0) {
        problems.push(
          `params: method "${def.method}" takes no params ` +
            `(got keys: ${Object.keys(params).join(', ')})`,
        );
      }
      break;
    }

    case 'concat': {
      if (params === undefined) break;

      for (const key of Object.keys(params)) {
        if (key !== 'separator') {
          problems.push(
            `params.${key} is not a recognized "concat" param (known params: separator)`,
          );
        }
      }

      if ('separator' in params && typeof params.separator !== 'string') {
        problems.push(
          `params.separator must be a string (got ${typeof params.separator})`,
        );
      }
      break;
    }

    case 'conditional': {
      if (!isPlainRecord(params)) {
        problems.push(
          'params: method "conditional" requires params { if: { column, op, value? }, then, else }',
        );
        break;
      }

      for (const key of Object.keys(params)) {
        if (!['if', 'then', 'else'].includes(key)) {
          problems.push(
            `params.${key} is not a recognized "conditional" param (known params: if, then, else)`,
          );
        }
      }

      const condition = params.if;

      if (!isPlainRecord(condition)) {
        problems.push('params.if must be an object { column, op, value? }');
      } else {
        for (const key of Object.keys(condition)) {
          if (!['column', 'op', 'value'].includes(key)) {
            problems.push(
              `params.if.${key} is not a recognized key (known keys: column, op, value)`,
            );
          }
        }

        if (
          typeof condition.column !== 'string' ||
          condition.column.length === 0
        ) {
          problems.push('params.if.column must be a non-empty string');
        }

        if (
          typeof condition.op !== 'string' ||
          !ROW_FILTER_OPS.includes(condition.op as RowFilterOp)
        ) {
          problems.push(
            `params.if.op "${String(condition.op)}" is not a recognized op — ` +
              `known ops: ${ROW_FILTER_OPS.join(', ')}`,
          );
        } else {
          problems.push(
            ...valueProblemsForOp(
              condition.op as RowFilterOp,
              condition.value,
            ).map((p) => `params.if: ${p}`),
          );
        }
      }

      for (const branch of ['then', 'else'] as const) {
        if (!(branch in params)) {
          problems.push(
            `params.${branch} is required (input ref "$<n>" or JSON literal)`,
          );
        } else {
          problems.push(
            ...valueRefProblems(params[branch], inputCount, `params.${branch}`),
          );
        }
      }
      break;
    }

    case 'arithmetic': {
      if (
        !isPlainRecord(params) ||
        typeof params.expr !== 'string' ||
        params.expr.trim() === ''
      ) {
        problems.push(
          'params: method "arithmetic" requires params { expr: string }',
        );
        break;
      }

      for (const key of Object.keys(params)) {
        if (key !== 'expr') {
          problems.push(
            `params.${key} is not a recognized "arithmetic" param (known params: expr)`,
          );
        }
      }

      try {
        const { maxInputRef } = compileArithmeticExpr(params.expr);

        if (maxInputRef > inputCount) {
          problems.push(
            `params.expr references input $${maxInputRef} but only ${inputCount} input(s) are declared`,
          );
        }
      } catch (error) {
        problems.push(
          `params.expr: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      break;
    }

    default:
      // Unknown methods are reported against COMPUTATION_METHOD_IDS by the
      // boundary; nothing to validate here.
      break;
  }

  return problems;
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

/** Case/whitespace/underscore/dash-insensitive header normalization, shared
 *  by resolveFieldMapping and the row-filter column resolution. */
const normalizeHeader = (s: string): string =>
  s.toLowerCase().replace(/[\s_-]+/g, '');

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
  const normalize = normalizeHeader;

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
 * @deprecated Required roles are now declared PER ENGINE on the
 * status-engine descriptors (`STATUS_ENGINES[id].requiredRoles` in
 * engines/status.ts) — this global is exactly the 'ambetter-bob-v1' entry's
 * requiredRoles, kept only as the default for legacy
 * `validateStatusRoleMapping` callers that don't pass an engine's roles.
 * Pipeline callers (parse.job) pass the selected engine's requiredRoles
 * instead. Lockstep with the Ambetter descriptor is policed by a unit test.
 *
 * (Original rationale, still true for the Ambetter engine: a null
 * effectiveDate blanket-defaults every row to ACTIVE_APPROVED, and a null
 * paidThroughDate blanket-derives PAYMENT_ERROR_* for every active row.
 * termDate and eligibleForCommission are legitimately null per row.)
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
  /** Configured required roles whose header resolves to nothing. */
  unresolvedRequired: UnresolvedStatusRole[];
  /** Configured optional roles whose header resolves to nothing. */
  unresolvedOptional: UnresolvedStatusRole[];
  /**
   * Required roles ABSENT from the mapping entirely — the silent failure
   * mode resolvability checks can't see (an omitted paidThroughDate mapping
   * blanket-derives PAYMENT_ERROR_* for the whole active book). Needs no
   * file rows to detect; callers should fail the run on it unconditionally.
   */
  missingRequired: string[];
};

/**
 * Validate a resolved status fieldMapping (output of resolveFieldMapping)
 * against the selected engine's required roles:
 *
 *   1. Resolvability — every configured role must point at either an actual
 *      file header or a computed-field output key. resolveFieldMapping keeps
 *      the configured header verbatim when nothing matches (needed for
 *      computed output keys), which also swallows genuine misconfigurations
 *      — e.g. a carrier renaming 'Paid Through Date' to 'Paid Thru' silently
 *      feeds null into the status engine.
 *   2. Presence — every required role must appear in the mapping AT ALL; a
 *      missing mapping is invisible to the resolvability pass but yields the
 *      same blanket-status corruption.
 *
 * Callers should fail the run for unresolvedRequired/missingRequired and log
 * loudly for unresolvedOptional. `requiredRoles` comes from the selected
 * status engine's descriptor (STATUS_ENGINES[id].requiredRoles); the default
 * exists only for legacy callers and equals the Ambetter engine's roles.
 */
export const validateStatusRoleMapping = (
  resolvedMapping: Record<string, string>,
  actualHeaders: string[],
  computedFields: ComputedFieldDef[] | null | undefined,
  requiredRoles: readonly string[] = REQUIRED_STATUS_ENGINE_ROLES,
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

    if (requiredRoles.includes(role)) {
      unresolvedRequired.push(unresolved);
    } else {
      unresolvedOptional.push(unresolved);
    }
  }

  const missingRequired = requiredRoles.filter(
    (role) => !(role in resolvedMapping),
  );

  return { unresolvedRequired, unresolvedOptional, missingRequired };
};

// ---------------------------------------------------------------------------
// Parse settings: headerRow + declarative row filters (OMN-12)
// ---------------------------------------------------------------------------

/** Row-filter operators (also the condition vocabulary of the 'conditional'
 *  computed-field method). String comparisons are trim + case-insensitive;
 *  'matches' compiles its value as a case-insensitive RegExp. */
export const ROW_FILTER_OPS = [
  'empty',
  'notEmpty',
  'equals',
  'contains',
  'startsWith',
  'matches',
] as const;

export type RowFilterOp = (typeof ROW_FILTER_OPS)[number];

/** Ops that require a non-empty `value`; the remaining ops take none. */
export const ROW_FILTER_OPS_REQUIRING_VALUE: readonly RowFilterOp[] = [
  'equals',
  'contains',
  'startsWith',
  'matches',
];

/**
 * One declarative row-filter rule (`parseSettings.rowFilters`), applied to
 * RAW rows after header extraction and before per-cell transforms. `column`
 * is a file header name (resolved with the same normalization as
 * resolveFieldMapping); a column matching NO file header makes the rule
 * inert (it never skips a row) — deliberately conservative so a typo'd
 * 'empty' rule cannot wipe the whole file.
 */
export type RowFilterRule = {
  column: string;
  op: RowFilterOp;
  value?: string;
  action: 'skip';
};

/**
 * Parse-stage settings stored on `carrierConfig.parseSettings` and validated
 * by `parseCarrierPipelineConfig`. All keys optional — defaults reproduce
 * historical behavior exactly (header on row 1, no filtering).
 */
export type ParseSettings = {
  /** 1-based header row in the sheet; rows above it are ignored entirely
   *  (range-aware parseXlsxSheet). Default 1 = today's behavior. */
  headerRow?: number;
  /** Declarative skip rules for footer/total/junk rows. */
  rowFilters?: RowFilterRule[];
  /** Unconditionally drop the last N data rows (footer totals). Default 0. */
  skipFooterRows?: number;
};

/** Historical behavior, bit-identical (no knobs turned). */
export const DEFAULT_PARSE_SETTINGS: Required<ParseSettings> = {
  headerRow: 1,
  rowFilters: [],
  skipFooterRows: 0,
};

const resolveParseSettings = (
  settings: ParseSettings | null | undefined,
): Required<ParseSettings> => ({
  headerRow: settings?.headerRow ?? DEFAULT_PARSE_SETTINGS.headerRow,
  rowFilters: settings?.rowFilters ?? DEFAULT_PARSE_SETTINGS.rowFilters,
  skipFooterRows:
    settings?.skipFooterRows ?? DEFAULT_PARSE_SETTINGS.skipFooterRows,
});

/**
 * Evaluate one row-filter op against a raw cell value. Comparison input is
 * the trimmed string form of the cell ('' for null/undefined); equals/
 * contains/startsWith are case-insensitive, 'matches' tests a
 * case-insensitive RegExp (compilability is boundary-validated).
 */
export const evaluateRowFilterOp = (
  cellValue: unknown,
  op: RowFilterOp,
  value: string | undefined,
): boolean => {
  const cell =
    cellValue === null || cellValue === undefined
      ? ''
      : String(cellValue).trim();

  switch (op) {
    case 'empty':
      return cell === '';
    case 'notEmpty':
      return cell !== '';
    case 'equals':
      return cell.toLowerCase() === (value ?? '').toLowerCase();
    case 'contains':
      return (
        (value ?? '') !== '' &&
        cell.toLowerCase().includes(value!.toLowerCase())
      );
    case 'startsWith':
      return (
        (value ?? '') !== '' &&
        cell.toLowerCase().startsWith(value!.toLowerCase())
      );
    case 'matches':
      return (value ?? '') !== '' && new RegExp(value!, 'i').test(cell);
  }
};

/** `value` problems for an op — shared by row-filter rule validation and the
 *  'conditional' computed-field params validation. */
const valueProblemsForOp = (op: RowFilterOp, value: unknown): string[] => {
  const problems: string[] = [];
  const requiresValue = ROW_FILTER_OPS_REQUIRING_VALUE.includes(op);

  if (requiresValue && (typeof value !== 'string' || value.length === 0)) {
    problems.push(`op "${op}" requires a non-empty string "value"`);
  }

  if (!requiresValue && value !== undefined) {
    problems.push(`op "${op}" takes no "value" (got ${JSON.stringify(value)})`);
  }

  if (op === 'matches' && typeof value === 'string' && value.length > 0) {
    try {
      new RegExp(value, 'i');
    } catch (error) {
      problems.push(
        `value ${JSON.stringify(value)} is not a valid regular expression ` +
          `(${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  return problems;
};

/**
 * Semantic validation of one row-filter rule, beyond what the zod shape can
 * express: per-op value-requiredness and 'matches' regex compilability.
 * Returns problem strings; the boundary (types/carrier-config.ts) hard-fails
 * on any, consistent with the computed-field method fail-fast.
 */
export const rowFilterRuleProblems = (rule: RowFilterRule): string[] =>
  valueProblemsForOp(rule.op, rule.value);

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
  /** Rows dropped by parseSettings.rowFilters / skipFooterRows (OMN-12).
   *  Always 0 when the knobs are unset. */
  skippedByRowFilter: number;
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
 *
 * `parseSettings` (OMN-12) contributes the row filters + skipFooterRows
 * applied here to RAW rows — after header extraction, before per-cell
 * transforms. Skipped rows are counted in `skippedByRowFilter` and surviving
 * rows keep their ORIGINAL 1-based data-row numbering (`__rowNumber` /
 * parseErrors indices are not renumbered by the filter). headerRow is
 * consumed earlier, by parseXlsxSheet.
 */
export const transformRows = (
  rawRows: ParsedRow[],
  headerTypes: Map<string, string>,
  computedFields: ComputedFieldDef[] | null,
  statusFieldMapping: Record<string, string>,
  policyNumberHeader?: string,
  transformRules?: TransformRules | null,
  parseSettings?: ParseSettings | null,
): TransformRowsResult => {
  const transforms = transformRules
    ? buildTransforms(transformRules)
    : TRANSFORMS;
  const settings = resolveParseSettings(parseSettings);
  const normalized: Record<string, unknown>[] = [];
  const parseErrors: CellParseError[] = [];
  let skippedByRowFilter = 0;

  // Resolve each rule's column against the actual headers (same
  // normalization as resolveFieldMapping). Unresolved columns make the rule
  // inert — see RowFilterRule.
  const actualHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const headerByNormalized = new Map(
    actualHeaders.map((h) => [normalizeHeader(h), h]),
  );
  const activeFilters = settings.rowFilters
    .map((rule) => ({
      rule,
      header: actualHeaders.includes(rule.column)
        ? rule.column
        : (headerByNormalized.get(normalizeHeader(rule.column)) ?? null),
    }))
    .filter(
      (entry): entry is { rule: RowFilterRule; header: string } =>
        entry.header !== null,
    );

  // Footer rows are skipped unconditionally (last N data rows).
  const footerStart =
    settings.skipFooterRows > 0
      ? Math.max(0, rawRows.length - settings.skipFooterRows)
      : rawRows.length;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];

    if (i >= footerStart) {
      skippedByRowFilter++;
      continue;
    }

    if (
      activeFilters.some(({ rule, header }) =>
        evaluateRowFilterOp(raw[header], rule.op, rule.value),
      )
    ) {
      skippedByRowFilter++;
      continue;
    }

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

  return { normalized, parseErrors, skippedByRowFilter };
};
