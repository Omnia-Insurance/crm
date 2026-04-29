import { jaroWinkler } from 'jaro-winkler-typescript';

import type { StatusDecision } from 'src/modules/reconciliation/engines/status';
import { daysBetweenUTC } from 'src/modules/reconciliation/parsers/transforms';
import type {
  ColumnMapping,
  ComputedFieldDef,
} from 'src/modules/reconciliation/types/reconciliation';

export type FieldDiffAction = 'UPDATE' | 'COMPUTED' | 'INFO_ONLY';
export type FieldDiffSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type FieldDiffApproval = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
export type CrmObjectType = 'policy' | 'lead';

export type FieldDiff = {
  field: string;
  label: string;
  bobValue: string | null;
  crmValue: string | null;
  action: FieldDiffAction;
  severity: FieldDiffSeverity;
  approval: FieldDiffApproval;
  crmField: string | null;
  crmObjectType: CrmObjectType | null;
  note: string | null;
};

// ---------------------------------------------------------------------------
// Compare methods registry
// ---------------------------------------------------------------------------

const NAME_THRESHOLD = 0.98;
const WHITESPACE_RE = /[\s]+/;

// US state normalization — BOB often has 2-letter codes (FL) while CRM
// stores full names (Florida). Normalize to 2-letter code for comparison.
const STATE_CODE_BY_NAME: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

const normalizeState = (s: string | null): string | null => {
  if (s == null) return null;
  const trimmed = s.trim();

  if (trimmed.length === 2) return trimmed.toUpperCase();

  return STATE_CODE_BY_NAME[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
};

const caseInsensitiveMatch = (a: string | null, b: string | null): boolean => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  return a.trim().toLowerCase() === b.trim().toLowerCase();
};

const exactMatch = (a: string | null, b: string | null): boolean => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  return a === b;
};

const fuzzyNameMatch = (a: string | null, b: string | null): boolean => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  const aLower = a.trim().toLowerCase();
  const bLower = b.trim().toLowerCase();

  if (aLower === bLower) return true;

  // Jaro-Winkler similarity
  if (jaroWinkler(aLower, bLower) >= NAME_THRESHOLD) return true;

  // Hyphenated name handling: "Archer" matches "Archer-Mckenley",
  // "Chancelyn Archer" matches "Chancelyn Archer-Mckenley".
  // Symmetric: either side may carry the hyphen suffix.
  const aWords = aLower.split(WHITESPACE_RE);
  const bWords = bLower.split(WHITESPACE_RE);
  const [shorter, longer] =
    aWords.length <= bWords.length ? [aWords, bWords] : [bWords, aWords];

  if (
    shorter.length > 0 &&
    shorter.every(
      (word, i) =>
        i < longer.length &&
        (longer[i] === word ||
          longer[i].startsWith(word + '-') ||
          word.startsWith(longer[i] + '-')),
    )
  ) {
    return true;
  }

  return false;
};

const daysBetween = (a: string, b: string): number =>
  Math.abs(daysBetweenUTC(a, b));

const dateWithin30dMatch = (a: string | null, b: string | null): boolean => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  return daysBetween(a, b) <= 30;
};

export const COMPARE_METHODS: Record<
  string,
  (a: string | null, b: string | null) => boolean
> = {
  exact: exactMatch,
  caseInsensitive: caseInsensitiveMatch,
  fuzzyName: fuzzyNameMatch,
  dateWithin30d: dateWithin30dMatch,
};

// ---------------------------------------------------------------------------
// CRM value lookup
//
// `crmPolicy` is keyed by the same dot-path paths used in columnMapping
// (`lead.name.firstName`, `agent.npn`, …) so the engine reads values with a
// direct property access — no translation table required. Build the input
// shape via `buildPolicyForDiff` in data.service.ts.
// ---------------------------------------------------------------------------

const resolveCrmObjectType = (crmField: string): CrmObjectType =>
  crmField.startsWith('lead.') ? 'lead' : 'policy';

const readCrmValue = (
  crmPolicy: Record<string, unknown>,
  crmField: string,
): string | null => {
  const value = crmPolicy[crmField];

  if (value === null || value === undefined) return null;

  return String(value);
};

// ---------------------------------------------------------------------------
// Column-mapping-driven diff (no FieldConfigEntry dependency)
// ---------------------------------------------------------------------------

/**
 * True when a CRM dot-path looks like a person/agent name field.
 *
 * Used to (a) pick the `fuzzyName` compare method regardless of inferred
 * fieldType, and (b) drive the NAME_MISMATCH review flag in field-config.ts.
 *
 * Path-suffix based so future name-shaped fields (`legalEntity.name`,
 * `lead.preferredName`, etc.) auto-classify without a registry update.
 */
export const isNameLikeCrmField = (
  crmField: string | null | undefined,
): boolean =>
  !!crmField &&
  (crmField.endsWith('.firstName') ||
    crmField.endsWith('.lastName') ||
    crmField.endsWith('.name'));

/** Infer compare method from CRM field metadata type. */
const inferCompareMethod = (fieldType: string): string => {
  switch (fieldType) {
    case 'FULL_NAME':
      return 'fuzzyName';
    case 'DATE_TIME':
    case 'DATE':
      return 'exact';
    case 'NUMBER':
    case 'NUMERIC':
    case 'BOOLEAN':
      return 'exact';
    default:
      return 'caseInsensitive';
  }
};

/**
 * Compute field diffs using the column mapping (XLSX header → CRM field)
 * instead of FieldConfigEntry[]. Compare methods are inferred from fieldType.
 */
export const computeFieldDiffsFromMapping = (
  bobRow: Record<string, unknown>,
  crmPolicy: Record<string, unknown>,
  statusDecision: StatusDecision | null,
  columnMapping: ColumnMapping,
  computedFields?: ComputedFieldDef[] | null,
): FieldDiff[] => {
  const diffs: FieldDiff[] = [];

  // Status diffs (COMPUTED from the status engine — not driven by columnMapping)
  if (statusDecision) {
    if (statusDecision.derivedStatus !== crmPolicy.status) {
      diffs.push({
        field: 'status',
        label: 'Status',
        bobValue: statusDecision.derivedStatus,
        crmValue: (crmPolicy.status as string) ?? null,
        action: 'COMPUTED',
        severity: 'CRITICAL',
        approval: 'PENDING',
        crmField: 'status',
        crmObjectType: 'policy',
        note: statusDecision.statusChangeReason,
      });
    }

    if (
      statusDecision.derivedExpireDate &&
      statusDecision.derivedExpireDate !== crmPolicy.expirationDate
    ) {
      diffs.push({
        field: 'expirationDate',
        label: 'Expiration Date',
        bobValue: statusDecision.derivedExpireDate,
        crmValue: (crmPolicy.expirationDate as string) ?? null,
        action: 'COMPUTED',
        severity: 'CRITICAL',
        approval: 'PENDING',
        crmField: 'expirationDate',
        crmObjectType: 'policy',
        note: statusDecision.statusChangeReason,
      });
    }
  }

  // Also skip status + expirationDate in column mapping — they're handled
  // by the COMPUTED status diffs above
  const computedCrmFields = new Set<string>(['status', 'expirationDate']);

  if (computedFields) {
    for (const cf of computedFields) {
      if (cf.crmField) computedCrmFields.add(cf.crmField);
    }
  }

  // Field-level diffs from column mapping
  for (const [xlsxHeader, entry] of Object.entries(columnMapping)) {
    // Skip if a computed field (or status engine) already covers this CRM field
    if (computedCrmFields.has(entry.crmField)) continue;

    const bobValue = bobRow[xlsxHeader];
    let bobStr = bobValue != null ? String(bobValue) : null;

    // Skip fields the data service didn't populate (e.g. premium.amountMicros)
    if (!(entry.crmField in crmPolicy)) continue;

    let crmStr = readCrmValue(crmPolicy, entry.crmField);

    // Normalize US state values so "FL" and "Florida" compare equal
    if (entry.crmField.endsWith('.addressState')) {
      bobStr = normalizeState(bobStr);
      crmStr = normalizeState(crmStr);
    }

    if (bobStr == null && crmStr == null) continue;

    // Don't suggest clearing CRM data when BOB has no value
    if ((bobStr == null || bobStr === '') && crmStr != null) continue;

    // Use fuzzyName for name-related fields regardless of inferred type
    const compareMethod = isNameLikeCrmField(entry.crmField)
      ? 'fuzzyName'
      : inferCompareMethod(entry.fieldType);
    const compareFn = COMPARE_METHODS[compareMethod];

    if (!compareFn || compareFn(bobStr, crmStr)) continue;

    diffs.push({
      field: xlsxHeader,
      label: xlsxHeader,
      bobValue: bobStr,
      crmValue: crmStr,
      action: 'UPDATE',
      severity: 'WARNING',
      approval: 'PENDING',
      crmField: entry.crmField,
      crmObjectType: resolveCrmObjectType(entry.crmField),
      note: null,
    });
  }

  // Diffs from computed fields that map to CRM fields
  if (computedFields) {
    for (const cf of computedFields) {
      if (!cf.crmField) continue;

      const bobValue = bobRow[cf.outputKey];
      const bobStr = bobValue != null ? String(bobValue) : null;
      const crmStr = readCrmValue(crmPolicy, cf.crmField);

      if (bobStr == null && crmStr == null) continue;

      const compareMethod = inferCompareMethod(
        cf.type === 'date' ? 'DATE_TIME' : 'TEXT',
      );
      const compareFn = COMPARE_METHODS[compareMethod];

      if (!compareFn || compareFn(bobStr, crmStr)) continue;

      diffs.push({
        field: cf.outputKey,
        label: cf.outputKey,
        bobValue: bobStr,
        crmValue: crmStr,
        action: 'UPDATE',
        severity: 'WARNING',
        approval: 'PENDING',
        crmField: cf.crmField,
        crmObjectType: resolveCrmObjectType(cf.crmField),
        note: null,
      });
    }
  }

  return diffs;
};

export const summarizeDiffs = (diffs: FieldDiff[]): string => {
  if (diffs.length === 0) return '';

  const summaryParts: string[] = [];
  const MAX_INLINE = 3;

  for (let i = 0; i < Math.min(diffs.length, MAX_INLINE); i++) {
    const d = diffs[i];

    summaryParts.push(
      `${d.label}: ${d.crmValue ?? '—'} → ${d.bobValue ?? '—'}`,
    );
  }

  if (diffs.length > MAX_INLINE) {
    summaryParts.push(`+${diffs.length - MAX_INLINE} more`);
  }

  return summaryParts.join('; ');
};
