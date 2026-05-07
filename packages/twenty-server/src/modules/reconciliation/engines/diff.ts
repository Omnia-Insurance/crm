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
 * Why the diff engine is suppressing lead identity updates. Both reasons
 * point to "the BOB row describes a person other than the CRM primary
 * lead" — auto-applying name/DOB diffs would overwrite the linked person
 * with someone else's identity. Surfaced as a synthetic INFO_ONLY diff
 * so reviewers see the rationale.
 */
type SubscriberMismatchReason =
  | {
      kind: 'MULTI_MEMBER_DOB_MISMATCH';
      yearsApart: number;
      applicantCount: number;
    }
  | {
      kind: 'CROSS_TERM_NAMESAKE';
      namesakePolicyId: string;
      namesakeFirstName: string | null;
      namesakeLastName: string | null;
    };

type SubscriberMismatch = {
  reason: SubscriberMismatchReason;
  bobFirstName: string | null;
  bobLastName: string | null;
  bobDob: string | null;
  crmFirstName: string | null;
  crmLastName: string | null;
  crmDob: string | null;
};

type LeadIdentityHeaders = {
  dobHeader: string | null;
  firstHeader: string | null;
  lastHeader: string | null;
};

const findLeadIdentityHeaders = (
  columnMapping: ColumnMapping,
): LeadIdentityHeaders => {
  let dobHeader: string | null = null;
  let firstHeader: string | null = null;
  let lastHeader: string | null = null;

  for (const [xlsxHeader, entry] of Object.entries(columnMapping)) {
    if (entry.crmField === 'lead.dateOfBirth') dobHeader = xlsxHeader;
    else if (entry.crmField === 'lead.name.firstName') firstHeader = xlsxHeader;
    else if (entry.crmField === 'lead.name.lastName') lastHeader = xlsxHeader;
  }

  return { dobHeader, firstHeader, lastHeader };
};

/**
 * Multi-member policy: CRM `applicantCount > 1` AND BOB DOB differs from
 * CRM lead DOB by > 1 year. The BOB describes a different family member
 * than the one linked as the policy's primary lead — typically because
 * the CRM has the dependent linked instead of the subscriber.
 */
const detectMultiMemberSubscriberMismatch = (
  bobRow: Record<string, unknown>,
  crmPolicy: Record<string, unknown>,
  headers: LeadIdentityHeaders,
): SubscriberMismatch | null => {
  const applicantCount = Number(crmPolicy.applicantCount);

  if (!Number.isFinite(applicantCount) || applicantCount <= 1) return null;
  if (!headers.dobHeader) return null;

  const bobDob = bobRow[headers.dobHeader];
  const crmDob = crmPolicy['lead.dateOfBirth'];

  if (typeof bobDob !== 'string' || typeof crmDob !== 'string') return null;

  const bobMs = new Date(bobDob).getTime();
  const crmMs = new Date(crmDob).getTime();

  if (Number.isNaN(bobMs) || Number.isNaN(crmMs)) return null;

  const yearsApart = Math.abs(bobMs - crmMs) / MS_PER_YEAR;

  if (yearsApart <= 1) return null;

  return {
    reason: {
      kind: 'MULTI_MEMBER_DOB_MISMATCH',
      yearsApart,
      applicantCount,
    },
    bobFirstName: headers.firstHeader
      ? ((bobRow[headers.firstHeader] as string) ?? null)
      : null,
    bobLastName: headers.lastHeader
      ? ((bobRow[headers.lastHeader] as string) ?? null)
      : null,
    bobDob,
    crmFirstName: (crmPolicy['lead.name.firstName'] as string) ?? null,
    crmLastName: (crmPolicy['lead.name.lastName'] as string) ?? null,
    crmDob,
  };
};

/**
 * Cross-term namesake conflict: another CRM policy under the same policy
 * number has a lead whose name matches the BOB row, while the matched
 * policy's lead doesn't. Carriers reuse policy numbers across plan years
 * / cancel-rebuy cycles, and Twenty creates a new lead per policy term.
 * When this fires, the BOB-named person already exists as a separate
 * CRM lead (linked to a different policy under the same number) — auto-
 * updating the matched lead's identity would overwrite the wrong person.
 *
 * `namesakes` is the list of CRM policies sharing this policy number
 * other than the matched one. Empty array (or absent) → no detection.
 */
const detectCrossTermNamesakeConflict = (
  bobRow: Record<string, unknown>,
  crmPolicy: Record<string, unknown>,
  headers: LeadIdentityHeaders,
  namesakes: readonly Record<string, unknown>[],
): SubscriberMismatch | null => {
  if (namesakes.length === 0) return null;
  if (!headers.firstHeader || !headers.lastHeader) return null;

  const bobFirst = (bobRow[headers.firstHeader] as string) ?? null;
  const bobLast = (bobRow[headers.lastHeader] as string) ?? null;

  if (!bobFirst || !bobLast) return null;

  const matchedFirst = (crmPolicy['lead.name.firstName'] as string) ?? null;
  const matchedLast = (crmPolicy['lead.name.lastName'] as string) ?? null;

  // Only fires when matched lead's name DOESN'T match BOB. Otherwise the
  // BOB is describing the linked person and there's no conflict to flag.
  const matchedFullName =
    matchedFirst && matchedLast ? `${matchedFirst} ${matchedLast}` : null;

  if (
    matchedFullName &&
    fuzzyNameMatch(`${bobFirst} ${bobLast}`, matchedFullName)
  ) {
    return null;
  }

  for (const namesake of namesakes) {
    const nFirst = (namesake['lead.name.firstName'] as string) ?? null;
    const nLast = (namesake['lead.name.lastName'] as string) ?? null;

    if (!nFirst || !nLast) continue;

    if (fuzzyNameMatch(`${bobFirst} ${bobLast}`, `${nFirst} ${nLast}`)) {
      const dobValue = headers.dobHeader
        ? (bobRow[headers.dobHeader] as string)
        : null;

      return {
        reason: {
          kind: 'CROSS_TERM_NAMESAKE',
          namesakePolicyId: (namesake.id as string) ?? '<unknown>',
          namesakeFirstName: nFirst,
          namesakeLastName: nLast,
        },
        bobFirstName: bobFirst,
        bobLastName: bobLast,
        bobDob: dobValue,
        crmFirstName: matchedFirst,
        crmLastName: matchedLast,
        crmDob: (crmPolicy['lead.dateOfBirth'] as string) ?? null,
      };
    }
  }

  return null;
};

const formatSubscriberMismatchValue = (
  first: string | null,
  last: string | null,
  dob: string | null,
): string => {
  const name = [first, last].filter(Boolean).join(' ').trim();

  if (name && dob) return `${name} (DOB ${dob})`;
  if (name) return name;
  if (dob) return `DOB ${dob}`;

  return '∅';
};

const formatSubscriberMismatchNote = (mismatch: SubscriberMismatch): string => {
  if (mismatch.reason.kind === 'MULTI_MEMBER_DOB_MISMATCH') {
    return (
      `Policy has ${mismatch.reason.applicantCount} members; BOB ` +
      `subscriber DOB differs from CRM primary lead by ` +
      `${mismatch.reason.yearsApart.toFixed(1)} years. Lead identity ` +
      `not auto-updated — verify subscriber/dependent linkage.`
    );
  }

  const namesakeFull = [
    mismatch.reason.namesakeFirstName,
    mismatch.reason.namesakeLastName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    `Another CRM policy under the same policy number is already linked ` +
    `to a lead matching the BOB row's name (${namesakeFull}). Lead ` +
    `identity not auto-updated — likely the BOB describes a different ` +
    `lead's policy term, or this lead was renamed; verify linkage ` +
    `before applying.`
  );
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
    case 'CURRENCY':
      return 'exact';
    default:
      return 'caseInsensitive';
  }
};

// BOB currency columns are dollars (e.g. "156.50"); CRM stores integer micros.
// Convert to micros for comparison so 156.50 ↔ 156500000 isn't a false diff,
// and so the FieldDiff carries the value in the unit Apply will write back.
const toMicrosString = (s: string | null): string | null => {
  if (s == null || s === '') return null;
  const num = Number(s);
  if (!Number.isFinite(num)) return null;
  return String(Math.round(num * 1_000_000));
};

// Legacy CRM statuses that already represent "canceled with extra context"
// (e.g. canceled due to non-payment). The engine never derives these, so a
// proposal to change one of them → plain CANCELED would strip useful context
// without changing the underlying termination state. Reviewers were rejecting
// these diffs by hand; suppress them.
const LEGACY_TERMINAL_CANCELED_STATUSES: ReadonlySet<string> = new Set([
  'PAYMENT_ERROR_CANCELED',
]);

const isTerminalCanceledDowngrade = (
  derivedStatus: string,
  crmStatus: unknown,
): boolean =>
  derivedStatus === 'CANCELED' &&
  typeof crmStatus === 'string' &&
  LEGACY_TERMINAL_CANCELED_STATUSES.has(crmStatus);

/**
 * Compute field diffs using the column mapping (XLSX header → CRM field)
 * instead of FieldConfigEntry[]. Compare methods are inferred from fieldType.
 *
 * `namesakes` (optional): other CRM policies sharing the same policyNumber
 * as the matched policy. Used by the cross-term namesake detector to
 * suppress lead identity diffs when the BOB row's name matches a lead
 * already linked to a different policy under the same number.
 */
export const computeFieldDiffsFromMapping = (
  bobRow: Record<string, unknown>,
  crmPolicy: Record<string, unknown>,
  statusDecision: StatusDecision | null,
  columnMapping: ColumnMapping,
  computedFields?: ComputedFieldDef[] | null,
  namesakes?: readonly Record<string, unknown>[],
): FieldDiff[] => {
  const diffs: FieldDiff[] = [];

  // Status diffs (COMPUTED from the status engine — not driven by columnMapping)
  if (statusDecision) {
    if (
      statusDecision.derivedStatus !== crmPolicy.status &&
      !isTerminalCanceledDowngrade(
        statusDecision.derivedStatus,
        crmPolicy.status,
      )
    ) {
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

  // Detect once per row: does the BOB describe a different person than
  // the CRM's primary lead? Two distinct triggers — multi-member policy
  // with DOB mismatch (subscriber-vs-dependent confusion) or cross-term
  // namesake conflict (BOB name matches a lead linked to a different
  // policy under the same number). Either way, suppress lead identity
  // diffs so we don't overwrite one person's record with another's.
  const headers = findLeadIdentityHeaders(columnMapping);
  const subscriberMismatch =
    detectMultiMemberSubscriberMismatch(bobRow, crmPolicy, headers) ??
    detectCrossTermNamesakeConflict(
      bobRow,
      crmPolicy,
      headers,
      namesakes ?? [],
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

    // BOB stores currency in dollars; CRM stores integer micros.
    // Convert so the diff record (and the Apply payload it produces) is
    // already in CRM's unit.
    if (entry.crmField.endsWith('.amountMicros')) {
      bobStr = toMicrosString(bobStr);
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

  // Surface the subscriber mismatch as a synthetic INFO_ONLY diff.
  // `crmField: null` keeps it out of the apply step's update loop
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
    const label =
      subscriberMismatch.reason.kind === 'MULTI_MEMBER_DOB_MISMATCH'
        ? 'Multi-member policy: BOB describes a different person'
        : 'Cross-term namesake: BOB name matches a different CRM lead under this policy number';

    diffs.push({
      field: '__multiMemberSubscriberMismatch',
      label,
      bobValue: bobLabel,
      crmValue: crmLabel,
      action: 'INFO_ONLY',
      severity: 'WARNING',
      approval: 'PENDING',
      crmField: null,
      crmObjectType: null,
      note: formatSubscriberMismatchNote(subscriberMismatch),
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
