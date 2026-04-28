import { jaroWinkler } from 'jaro-winkler-typescript';

import type { StatusDecision } from 'src/modules/reconciliation/engines/status';
import { daysBetweenUTC } from 'src/modules/reconciliation/parsers/transforms';
import type { FieldConfigEntry } from 'src/modules/reconciliation/types/field-config';
import type {
  ColumnMapping,
  ComputedFieldDef,
} from 'src/modules/reconciliation/types/reconciliation';

export type FieldDiffAction = 'UPDATE' | 'COMPUTED' | 'INFO_ONLY';
export type FieldDiffSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type FieldDiffApproval =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SKIPPED';
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
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
};

const normalizeState = (s: string | null): string | null => {
  if (s == null) return null;
  const trimmed = s.trim();

  if (trimmed.length === 2) return trimmed.toUpperCase();

  return STATE_CODE_BY_NAME[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
};

const caseInsensitiveMatch = (
  a: string | null,
  b: string | null,
): boolean => {
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
  // "Chancelyn Archer" matches "Chancelyn Archer-Mckenley"
  const aWords = aLower.split(WHITESPACE_RE);
  const bWords = bLower.split(WHITESPACE_RE);
  const [shorter, longer] =
    aWords.length <= bWords.length ? [aWords, bWords] : [bWords, aWords];

  // Every word in the shorter name must match the start of the
  // corresponding word in the longer name (handles hyphen suffixes)
  if (
    shorter.length > 0 &&
    shorter.every(
      (word, i) =>
        i < longer.length &&
        (longer[i] === word || longer[i].startsWith(word + '-')),
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
// CRM field path → flat CRM record property name
//
// CRM records from data.service.ts use flat property names (leadFirstName,
// agentName, etc.). The fieldConfig uses dot-path notation (lead.name.firstName).
// This map bridges the two.
// ---------------------------------------------------------------------------

const CRM_FIELD_MAP: Record<string, string> = {
  'policyNumber': 'policyNumber',
  'effectiveDate': 'effectiveDate',
  'expirationDate': 'expirationDate',
  'status': 'status',
  'applicantCount': 'applicantCount',
  'lead.name.firstName': 'leadFirstName',
  'lead.name.lastName': 'leadLastName',
  'lead.dateOfBirth': 'leadDob',
  'lead.phone': 'leadPhone',
  'lead.email': 'leadEmail',
  'planIdentifier': 'planIdentifier',
  'agent.name': 'agentName',
  'agent.npn': 'agentNpn',
  // Accept sub-field paths too (from person object directly)
  'name.firstName': 'leadFirstName',
  'name.lastName': 'leadLastName',
  'dateOfBirth': 'leadDob',
  // Additional paths from import dialog column matching (composite sub-fields)
  'lead.phones.primaryPhoneNumber': 'leadPhone',
  'lead.emails.primaryEmail': 'leadEmail',
  'lead.addressCustom.addressState': 'leadState',
};

const resolveCrmObjectType = (crmField: string): CrmObjectType =>
  crmField.startsWith('lead.') ? 'lead' : 'policy';

const resolveCrmValue = (
  crmPolicy: Record<string, unknown>,
  crmField: string,
): string | null => {
  const flatKey = CRM_FIELD_MAP[crmField] ?? crmField;
  const value = crmPolicy[flatKey];

  if (value === null || value === undefined) return null;

  return String(value);
};

// ---------------------------------------------------------------------------
// computeFieldDiffs
// ---------------------------------------------------------------------------

export const computeFieldDiffs = (
  bobRow: Record<string, unknown>,
  crmPolicy: Record<string, unknown>,
  statusDecision: StatusDecision | null,
  fieldConfig?: FieldConfigEntry[],
): FieldDiff[] => {
  const diffs: FieldDiff[] = [];

  // Status diffs (COMPUTED from status engine — always hardcoded, not field-config-driven)
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

  // Field-level diffs from config
  if (fieldConfig) {
    for (const field of fieldConfig) {
      if (!field.compareMethod) continue;

      const bobValue = bobRow[field.name];
      const bobStr = bobValue != null ? String(bobValue) : null;

      // Only compare if this field has a CRM counterpart or a known mapping
      const crmField = field.crmField;

      // For fields without crmField, compare against CRM using known mappings
      // (e.g., brokerName compared to agentName for INFO_ONLY display)
      let crmStr: string | null = null;

      if (crmField) {
        crmStr = resolveCrmValue(crmPolicy, crmField);
      } else {
        // For non-CRM fields, try matching by convention (agent fields)
        const conventionMap: Record<string, string> = {
          brokerName: 'agentName',
          brokerNpn: 'agentNpn',
          planName: 'planIdentifier',
          memberPhone: 'leadPhone',
          memberEmail: 'leadEmail',
        };
        const mapped = conventionMap[field.name];

        if (mapped) {
          const value = crmPolicy[mapped];

          crmStr = value != null ? String(value) : null;
        }
      }

      // Skip if both are empty
      if (bobStr == null && crmStr == null) continue;

      const compareFn = COMPARE_METHODS[field.compareMethod];

      if (!compareFn) continue;

      if (!compareFn(bobStr, crmStr)) {
        const hasAction = !!crmField;

        diffs.push({
          field: field.name,
          label: field.label,
          bobValue: bobStr,
          crmValue: crmStr,
          action: hasAction ? 'UPDATE' : 'INFO_ONLY',
          severity: hasAction ? 'WARNING' : 'INFO',
          approval: hasAction ? 'PENDING' : 'SKIPPED',
          crmField: crmField ?? null,
          crmObjectType: crmField ? resolveCrmObjectType(crmField) : null,
          note: null,
        });
      }
    }

    return diffs;
  }

  // Legacy fallback: no fieldConfig provided (backward compat during migration)
  return diffs;
};

// ---------------------------------------------------------------------------
// Column-mapping-driven diff (no FieldConfigEntry dependency)
// ---------------------------------------------------------------------------

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

  // Status diffs (always hardcoded — same as computeFieldDiffs)
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

    // Skip fields we can't resolve from CRM data (e.g. premium.amountMicros,
    // lead.addressCustom.addressState — no flat CRM property exists for these)
    const flatKey = CRM_FIELD_MAP[entry.crmField];

    if (!flatKey && !(entry.crmField in crmPolicy)) continue;

    let crmStr = resolveCrmValue(crmPolicy, entry.crmField);

    // Normalize US state values so "FL" and "Florida" compare equal
    if (entry.crmField.endsWith('.addressState')) {
      bobStr = normalizeState(bobStr);
      crmStr = normalizeState(crmStr);
    }

    if (bobStr == null && crmStr == null) continue;

    // Don't suggest clearing CRM data when BOB has no value
    if ((bobStr == null || bobStr === '') && crmStr != null) continue;

    // Use fuzzyName for name-related fields regardless of inferred type
    const isNameField =
      entry.crmField === 'agent.name' ||
      entry.crmField.endsWith('.name') ||
      entry.crmField.endsWith('.firstName') ||
      entry.crmField.endsWith('.lastName');
    const compareMethod = isNameField
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
      const crmStr = resolveCrmValue(crmPolicy, cf.crmField);

      if (bobStr == null && crmStr == null) continue;

      const compareMethod = inferCompareMethod(cf.type === 'date' ? 'DATE_TIME' : 'TEXT');
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

    summaryParts.push(`${d.label}: ${d.crmValue ?? '—'} → ${d.bobValue ?? '—'}`);
  }

  if (diffs.length > MAX_INLINE) {
    summaryParts.push(`+${diffs.length - MAX_INLINE} more`);
  }

  return summaryParts.join('; ');
};
