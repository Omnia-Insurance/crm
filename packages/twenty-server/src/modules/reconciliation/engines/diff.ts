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

/**
 * True when proposing to move CRM's `effectiveDate` *backwards* in time —
 * almost always the carrier carrying forward the original enrollment date
 * across a renewal, not a real correction. Suppressing avoids over-writing
 * a renewal record's effective date with the prior plan year's start.
 *
 * Forward moves still produce a diff (rare data corrections still surface).
 */
const isBackwardsEffectiveDateMove = (
  crmField: string,
  bobValue: string | null,
  crmValue: string | null,
): boolean => {
  if (crmField !== 'effectiveDate') return false;
  if (!bobValue || !crmValue) return false;

  const bob = new Date(bobValue).getTime();
  const crm = new Date(crmValue).getTime();

  if (Number.isNaN(bob) || Number.isNaN(crm)) return false;

  return bob < crm;
};

/**
 * Lead identity fields. On multi-member policies, these describe a
 * specific person — overwriting them when the BOB row's subscriber
 * differs from the CRM's primary lead destroys data for whichever person
 * happens to be linked. Treated as a unit by the subscriber-mismatch
 * suppression below.
 */
const LEAD_IDENTITY_CRM_FIELDS: ReadonlySet<string> = new Set([
  'lead.name.firstName',
  'lead.name.lastName',
  'lead.dateOfBirth',
]);

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Detect the case where a multi-member policy's CRM primary-lead identity
 * doesn't match the BOB row's subscriber. Carriers report ONE row per
 * policy keyed against the subscriber, so when:
 *
 *   1. CRM `applicantCount > 1` (the policy has dependents), AND
 *   2. The BOB row's DOB and the CRM lead's DOB are clearly different
 *      humans (>1 year apart — rules out typos / same-day-different-year
 *      data-entry slips, catches actual identity mismatches),
 *
 * …the BOB describes a different family member than the one currently
 * linked as the policy's primary lead. Auto-applying name/DOB updates in
 * that situation overwrites the linked person with the subscriber's
 * identity and silently destroys the dependent's record. The right move
 * is human research: either fix the subscriber/dependent linkage or
 * verify the BOB.
 *
 * Returns the detected context (used by caller to emit a synthetic
 * INFO_ONLY diff) or null when the heuristic doesn't fire.
 */
type SubscriberMismatch = {
  bobFirstName: string | null;
  bobLastName: string | null;
  bobDob: string;
  crmFirstName: string | null;
  crmLastName: string | null;
  crmDob: string;
  yearsApart: number;
  applicantCount: number;
};

const detectMultiMemberSubscriberMismatch = (
  bobRow: Record<string, unknown>,
  crmPolicy: Record<string, unknown>,
  columnMapping: ColumnMapping,
): SubscriberMismatch | null => {
  const applicantCount = Number(crmPolicy.applicantCount);

  if (!Number.isFinite(applicantCount) || applicantCount <= 1) return null;

  let dobHeader: string | null = null;
  let firstHeader: string | null = null;
  let lastHeader: string | null = null;

  for (const [xlsxHeader, entry] of Object.entries(columnMapping)) {
    if (entry.crmField === 'lead.dateOfBirth') dobHeader = xlsxHeader;
    else if (entry.crmField === 'lead.name.firstName') firstHeader = xlsxHeader;
    else if (entry.crmField === 'lead.name.lastName') lastHeader = xlsxHeader;
  }

  if (!dobHeader) return null;

  const bobDob = bobRow[dobHeader];
  const crmDob = crmPolicy['lead.dateOfBirth'];

  if (typeof bobDob !== 'string' || typeof crmDob !== 'string') return null;

  const bobMs = new Date(bobDob).getTime();
  const crmMs = new Date(crmDob).getTime();

  if (Number.isNaN(bobMs) || Number.isNaN(crmMs)) return null;

  const yearsApart = Math.abs(bobMs - crmMs) / MS_PER_YEAR;

  if (yearsApart <= 1) return null;

  return {
    bobFirstName: firstHeader
      ? ((bobRow[firstHeader] as string) ?? null)
      : null,
    bobLastName: lastHeader ? ((bobRow[lastHeader] as string) ?? null) : null,
    bobDob,
    crmFirstName: (crmPolicy['lead.name.firstName'] as string) ?? null,
    crmLastName: (crmPolicy['lead.name.lastName'] as string) ?? null,
    crmDob,
    yearsApart,
    applicantCount,
  };
};

const formatSubscriberMismatchValue = (
  first: string | null,
  last: string | null,
  dob: string,
): string => {
  const name = [first, last].filter(Boolean).join(' ').trim();

  return name ? `${name} (DOB ${dob})` : `DOB ${dob}`;
};

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

  // Detect once per row: does the BOB describe a different family member
  // than the CRM's primary lead on a multi-member policy? When true, lead
  // identity diffs below are skipped to avoid overwriting one person's
  // record with another's.
  const subscriberMismatch = detectMultiMemberSubscriberMismatch(
    bobRow,
    crmPolicy,
    columnMapping,
  );

  // Field-level diffs from column mapping
  for (const [xlsxHeader, entry] of Object.entries(columnMapping)) {
    // Skip if a computed field (or status engine) already covers this CRM field
    if (computedCrmFields.has(entry.crmField)) continue;

    // On multi-member policies where BOB describes a different person,
    // don't touch lead identity. Surfaced via the synthetic INFO_ONLY
    // diff pushed below.
    if (subscriberMismatch && LEAD_IDENTITY_CRM_FIELDS.has(entry.crmField)) {
      continue;
    }

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

    // Don't suggest moving effectiveDate backwards (renewal carry-forward)
    if (isBackwardsEffectiveDateMove(entry.crmField, bobStr, crmStr)) continue;

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

      // Same suppression on the computed-fields path
      if (subscriberMismatch && LEAD_IDENTITY_CRM_FIELDS.has(cf.crmField)) {
        continue;
      }

      const bobValue = bobRow[cf.outputKey];
      const bobStr = bobValue != null ? String(bobValue) : null;
      const crmStr = readCrmValue(crmPolicy, cf.crmField);

      if (bobStr == null && crmStr == null) continue;

      // Don't suggest moving effectiveDate backwards (renewal carry-forward)
      if (isBackwardsEffectiveDateMove(cf.crmField, bobStr, crmStr)) continue;

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

  // Surface the multi-member subscriber mismatch as a synthetic INFO_ONLY
  // diff. `crmField: null` keeps it out of the apply step's update loop
  // (frontend filters on `d.crmField !== null`); the UI still renders it
  // so reviewers see *why* the lead identity wasn't proposed for update.
  if (subscriberMismatch) {
    const bobLabel = formatSubscriberMismatchValue(
      subscriberMismatch.bobFirstName,
      subscriberMismatch.bobLastName,
      subscriberMismatch.bobDob,
    );
    const crmLabel = formatSubscriberMismatchValue(
      subscriberMismatch.crmFirstName,
      subscriberMismatch.crmLastName,
      subscriberMismatch.crmDob,
    );

    diffs.push({
      field: '__multiMemberSubscriberMismatch',
      label: 'Multi-member policy: BOB describes a different person',
      bobValue: bobLabel,
      crmValue: crmLabel,
      action: 'INFO_ONLY',
      severity: 'WARNING',
      approval: 'PENDING',
      crmField: null,
      crmObjectType: null,
      note:
        `Policy has ${subscriberMismatch.applicantCount} members; BOB ` +
        `subscriber DOB differs from CRM primary lead by ` +
        `${subscriberMismatch.yearsApart.toFixed(1)} years. Lead identity ` +
        `not auto-updated — verify subscriber/dependent linkage.`,
    });
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
