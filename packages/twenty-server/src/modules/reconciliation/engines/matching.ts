import { jaroWinkler } from 'jaro-winkler-typescript';
import { RECONCILIATION_DEFAULT_AUTO_MATCH_THRESHOLD } from 'twenty-shared/constants';

import { NEGATIVE_TERMINAL_STATUSES } from 'src/modules/reconciliation/types/policy-statuses';

export type MatchMethod =
  | 'OVERRIDE'
  | 'POLICY_NUMBER_DATE_AGENT'
  | 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE'
  | 'POLICY_NUMBER_PLUS_AGENT'
  | 'POLICY_NUMBER_SINGLE'
  | 'POLICY_NUMBER_MULTI_BEST'
  | 'POLICY_NUMBER_NARROWED_RECENT'
  | 'NPN_DATE_NAME'
  | 'NAME_DOB_DATE'
  | 'MISSING_FROM_BOB'
  | 'POLICY_NUMBER_DISCOVERY'
  | 'UNMATCHED';

export type MatchStatus = 'AUTO_MATCHED' | 'NEEDS_REVIEW' | 'UNMATCHED';

export type MatchDecision = {
  crmPolicyId: string | null;
  crmPolicyNumber: string | null;
  confidence: number;
  method: MatchMethod;
  status: MatchStatus;
  notes: string;
};

// ---------------------------------------------------------------------------
// Role-based match input (config-driven replacement for BobRow)
// ---------------------------------------------------------------------------

export type MatchInput = {
  policyNumber: string | null;
  effectiveDate: string | null;
  paidThroughDate: string | null;
  agentName: string | null;
  agentNpn: string | null;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberDob: string | null;
};

/**
 * Schema: which CRM dot-paths feed which matching role.
 *
 * The matching engine compares BOB rows against `CrmPolicy` records via the
 * roles defined on `MatchInput`. A `ColumnMapping` entry whose `crmField` is
 * a key here contributes its BOB-row value to the corresponding role.
 *
 * Adding a row that maps a new CRM path → existing role is safe.
 * Adding a *new* role to `MatchInput` without an entry here will fail the
 * `_MatchingRoleCoverageGuard` typecheck below.
 */
export const MATCHING_ROLE_BY_CRM_FIELD = {
  policyNumber: 'policyNumber',
  effectiveDate: 'effectiveDate',
  paidThroughDate: 'paidThroughDate',
  'lead.name.firstName': 'memberFirstName',
  'lead.name.lastName': 'memberLastName',
  'lead.dateOfBirth': 'memberDob',
  'agent.name': 'agentName',
  'agent.npn': 'agentNpn',
  // Bare sub-field paths (when a row is keyed against a person directly)
  'name.firstName': 'memberFirstName',
  'name.lastName': 'memberLastName',
  dateOfBirth: 'memberDob',
} as const satisfies Record<string, keyof MatchInput>;

// Compile-time guard: every role in MatchInput must appear as a value in the
// registry above. If you add a role without an entry, this line errors with
// "Type 'X' does not satisfy the constraint 'never'".
type _Assert<T extends never> = T;
type _UncoveredMatchInputRoles = Exclude<
  keyof MatchInput,
  (typeof MATCHING_ROLE_BY_CRM_FIELD)[keyof typeof MATCHING_ROLE_BY_CRM_FIELD]
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MatchingRoleCoverageGuard = _Assert<_UncoveredMatchInputRoles>;

/**
 * Canonical form for policy-number comparison: trimmed + uppercased,
 * mirroring what `isValidAmbetterPolicyNumber` already does for validation.
 * CRM policy numbers are hand-entered ('u94692964', trailing spaces), so
 * both the `policyByNumber` index keys and the BOB-side `MatchInput` value
 * must be normalized or exact-identifier matches silently miss.
 */
export const normalizePolicyNumber = (
  value: string | null | undefined,
): string | null => {
  if (!value) return null;

  const normalized = value.trim().toUpperCase();

  return normalized.length > 0 ? normalized : null;
};

/**
 * Canonical 'YYYY-MM-DD' form for DOB comparison. The BOB side is already
 * normalized to a plain date by the parse transforms, but the CRM side is
 * whatever the ORM returns for `lead.dateOfBirth` — possibly an ISO
 * timestamp ('1990-05-15T00:00:00.000Z') or a Date instance. Tier 8 and
 * the Tier 6/7 DOB corroboration compare normalized values so a format
 * difference can't produce silent false negatives.
 */
export const normalizeDateOnly = (
  value: string | Date | null | undefined,
): string | null => {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) return null;

  // ISO date or timestamp — take the date part directly (no TZ math).
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);

  if (isoMatch) return isoMatch[1];

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) return null;

  const yyyy = String(parsed.getFullYear()).padStart(4, '0');
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
};

// ---------------------------------------------------------------------------
// Column-mapping-driven match input
// ---------------------------------------------------------------------------

import type { ColumnMapping } from 'src/modules/reconciliation/types/reconciliation';

const MATCHING_FIELD_SIMILARITY_THRESHOLD = 0.85;

const lookupMatchingRole = (crmField: string): keyof MatchInput | undefined =>
  MATCHING_ROLE_BY_CRM_FIELD[
    crmField as keyof typeof MATCHING_ROLE_BY_CRM_FIELD
  ];

/**
 * True when `crmField` is *close to* a registered matching path but not in
 * the registry. Used by `buildMatchInputFromMapping` to surface likely
 * carrier-config typos (e.g. `lead.name.first` instead of `lead.name.firstName`)
 * via the optional `onUnmappedField` callback.
 */
const looksLikeMatchingFieldButMisses = (crmField: string): boolean => {
  if (lookupMatchingRole(crmField) !== undefined) return false;
  return Object.keys(MATCHING_ROLE_BY_CRM_FIELD).some(
    (key) => jaroWinkler(crmField, key) >= MATCHING_FIELD_SIMILARITY_THRESHOLD,
  );
};

export const buildMatchInputFromMapping = (
  row: Record<string, unknown>,
  columnMapping: ColumnMapping,
  computedFieldCrmFields?: Record<string, string>,
  onUnmappedField?: (xlsxHeader: string, crmField: string) => void,
): MatchInput => {
  const result: MatchInput = {
    policyNumber: null,
    effectiveDate: null,
    paidThroughDate: null,
    agentName: null,
    agentNpn: null,
    memberFirstName: null,
    memberLastName: null,
    memberDob: null,
  };

  // Map from column mapping entries (XLSX header → CRM field → matching role)
  for (const [xlsxHeader, entry] of Object.entries(columnMapping)) {
    const role = lookupMatchingRole(entry.crmField);

    if (role) {
      result[role] = (row[xlsxHeader] as string) ?? null;
    } else if (
      onUnmappedField !== undefined &&
      looksLikeMatchingFieldButMisses(entry.crmField)
    ) {
      onUnmappedField(xlsxHeader, entry.crmField);
    }
  }

  // Map from computed fields (output key → CRM field → matching role)
  if (computedFieldCrmFields) {
    for (const [outputKey, crmField] of Object.entries(
      computedFieldCrmFields,
    )) {
      const role = lookupMatchingRole(crmField);

      if (role && result[role] === null) {
        result[role] = (row[outputKey] as string) ?? null;
      }
    }
  }

  result.policyNumber = normalizePolicyNumber(result.policyNumber);

  return result;
};

/**
 * CRM policy snapshot for matching + diff. Keyed by the same dot-paths used
 * in `ColumnMapping.crmField` so the diff engine can read values with a
 * direct property access (no flat-to-path translation table required).
 *
 * Phase-1 fields are populated by `fetchPoliciesForMatching`. Phase-2 fields
 * (the `enriched` group) are populated by `enrichMatchedPolicies` only for
 * matched policies and merged at diff time.
 */
export type CrmPolicy = {
  id: string;
  // Top-level (no dot)
  policyNumber: string | null;
  applicationId: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  paidThroughDate: string | null;
  status: string | null;
  applicantCount: number | null;
  // Currency is stored as integer micros on the CRM (1 USD = 1_000_000)
  'premium.amountMicros': number | null;
  // Lead (path-keyed)
  'lead.name.firstName': string | null;
  'lead.name.lastName': string | null;
  'lead.dateOfBirth': string | null;
  'lead.addressCustom.addressState': string | null;
  // Agent (path-keyed)
  'agent.name': string | null;
  'agent.npn': string | null;
  // Phase-2 enrichment (defaulted null on initial fetch)
  planIdentifier: string | null;
  'lead.phones.primaryPhoneNumber': string | null;
  'lead.emails.primaryEmail': string | null;
  'lead.id': string | null;
};

export type Override = {
  carrierPolicyNumber: string;
  carrierName: string;
  crmPolicyId: string;
  isActive: boolean;
};

export type MatchingConfig = {
  enabledTiers: string[];
  autoMatchThreshold: number;
  autoRejectThreshold: number;
  dateToleranceDays: number;
  nameMatchThreshold: number;
  /** When true, detect active CRM policies missing from the BOB (2-way reconciliation). Default: false (1-way). */
  enableMissingFromBob: boolean;
  /** Jaro-Winkler threshold for agent/broker name fuzzy matching. Default: 0.85 */
  agentNameThreshold: number;
  /** Confidence bands for Tier 7 (NPN+Date+Name). Default: { high: 0.98, medium: 0.93, low: 0.85 } */
  tier7NameBands: { high: number; medium: number; low: number };
  /** Confidence scores for Tier 7 bands. Default: { high: 92, medium: 88, low: 65 } */
  tier7ConfidenceScores: { high: number; medium: number; low: number };
  /** Minimum name score for Tier 7 to trigger. Default: 0.85 */
  tier7MinNameScore: number;
  // Status-engine thresholds (placedThresholdDays / paymentErrorAgeDays)
  // were removed from MatchingConfig in Phase 4.3 — their single home is
  // StatusConfig (types/reconciliation.ts), resolved through
  // parseCarrierPipelineConfig. Legacy keys still stored in matchingConfig
  // JSON are ignored by the boundary.
  /** Exclude BOB rows with effective dates before this date.
   *  Per-carrier; null = no cutoff. */
  startDate: string | null;
  /** Minimum name score for policy number discovery. Default: 0.95 */
  discoveryNameThreshold: number;
  /** Name score above which discovery auto-matches. Default: 0.98 */
  discoveryAutoThreshold: number;
};

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  enabledTiers: [
    'OVERRIDE',
    'POLICY_NUMBER_DATE_AGENT',
    'POLICY_NUMBER_DATE',
    'POLICY_NUMBER_AGENT',
    'POLICY_NUMBER_SINGLE',
    'POLICY_NUMBER_MULTI_BEST',
    'NPN_DATE_NAME',
    'NAME_DOB_DATE',
  ],
  // Shared with the review UI's high-confidence batch-apply scope (2.7).
  autoMatchThreshold: RECONCILIATION_DEFAULT_AUTO_MATCH_THRESHOLD,
  autoRejectThreshold: 30,
  dateToleranceDays: 30,
  nameMatchThreshold: 0.88,
  enableMissingFromBob: false,
  agentNameThreshold: 0.85,
  tier7NameBands: { high: 0.98, medium: 0.93, low: 0.85 },
  tier7ConfidenceScores: { high: 92, medium: 88, low: 65 },
  tier7MinNameScore: 0.85,
  // Omnia/Ambetter onboarding date — the day Omnia became broker of record.
  // THE single source for the legacy default (formerly duplicated as
  // DEFAULT_START_DATE in match.job.ts and types/reconciliation.ts, both
  // deleted in Phase 4.4). It is an Omnia business-history constant, not a
  // sensible cutoff for any other carrier: new carrier configs should seed
  // their own startDate (null = no cutoff). Rows skipped by this cutoff are
  // counted in stats.skippedBeforeStartDate.
  startDate: '2025-07-09',
  discoveryNameThreshold: 0.95,
  discoveryAutoThreshold: 0.98,
};

// --- Fuzzy matching helpers ---

const COMPANY_SUFFIXES = /\b(llc|inc|corp|corporation|dba|ltd|co|company)\b/gi;
const PUNCTUATION_RE = /[.,]/g;

const normalizeAgentName = (name: string): string =>
  name
    .toLowerCase()
    .replace(COMPANY_SUFFIXES, '')
    .replace(PUNCTUATION_RE, '')
    .trim();

/**
 * Minimum normalized length for agent/broker name comparison. Suffix-only
 * names ('LLC', 'Inc.', 'Co') normalize to '' and the substring fallback
 * would match every broker ('anything'.includes('') === true); very short
 * names ('AB') substring-match far too many unrelated brokers.
 */
const MIN_AGENT_NAME_LENGTH = 3;

export const agentNameMatches = (
  brokerName: string | null,
  agentName: string | null,
  threshold = 0.85,
): boolean => {
  if (!brokerName || !agentName) {
    return false;
  }

  const broker = normalizeAgentName(brokerName);
  const agent = normalizeAgentName(agentName);

  if (
    broker.length < MIN_AGENT_NAME_LENGTH ||
    agent.length < MIN_AGENT_NAME_LENGTH
  ) {
    return false;
  }

  if (jaroWinkler(broker, agent) >= threshold) {
    return true;
  }

  return broker.includes(agent) || agent.includes(broker);
};

export const memberNameScore = (
  bobFirst: string | null,
  bobLast: string | null,
  crmFirst: string | null,
  crmLast: string | null,
): number => {
  if (!bobFirst || !bobLast || !crmFirst || !crmLast) {
    return 0;
  }

  const firstScore = jaroWinkler(
    bobFirst.toLowerCase(),
    crmFirst.toLowerCase(),
  );
  const lastScore = jaroWinkler(bobLast.toLowerCase(), crmLast.toLowerCase());

  return firstScore * 0.4 + lastScore * 0.6;
};

export const datesWithinDays = (
  dateA: string | null,
  dateB: string | null,
  days: number,
): boolean => {
  if (!dateA || !dateB) {
    return false;
  }

  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  const diffMs = Math.abs(a - b);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays <= days;
};

const dateProximityScore = (
  dateA: string | null,
  dateB: string | null,
): number => {
  if (!dateA || !dateB) {
    return 0;
  }

  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  const diffDays = Math.abs(a - b) / (1000 * 60 * 60 * 24);

  if (diffDays === 0) return 1;
  if (diffDays <= 7) return 0.9;
  if (diffDays <= 30) return 0.7;
  if (diffDays <= 60) return 0.4;

  return 0.1;
};

const classifyConfidence = (
  confidence: number,
  config: MatchingConfig,
): MatchStatus => {
  if (confidence >= config.autoMatchThreshold) return 'AUTO_MATCHED';
  if (confidence < config.autoRejectThreshold) return 'UNMATCHED';

  return 'NEEDS_REVIEW';
};

/**
 * Validates that a policy number looks like a real Ambetter policy number.
 * Ambetter policy numbers always start with "U" (e.g., U94692964).
 * Non-U values are likely FFM IDs or other mistyped identifiers.
 */
export const isValidAmbetterPolicyNumber = (
  policyNumber: string | null,
): boolean => {
  if (!policyNumber) return false;

  return policyNumber.trim().toUpperCase().startsWith('U');
};

/**
 * Combined full-name fuzzy match. Concatenates "firstName lastName" from both
 * sides and runs Jaro-Winkler on the combined strings.
 * Handles typos like "Marry Jane" → "Mary Jane" at 95%+ confidence.
 */
export const combinedNameFuzzyMatch = (
  firstName1: string | null,
  lastName1: string | null,
  firstName2: string | null,
  lastName2: string | null,
): number => {
  if (!firstName1 || !lastName1 || !firstName2 || !lastName2) return 0;

  const full1 = `${firstName1.trim()} ${lastName1.trim()}`.toLowerCase();
  const full2 = `${firstName2.trim()} ${lastName2.trim()}`.toLowerCase();

  return jaroWinkler(full1, full2);
};

const isTierEnabled = (tier: string, config: MatchingConfig): boolean =>
  config.enabledTiers.includes(tier);

/**
 * Two Tier-7 candidates whose name scores differ by less than this are
 * "effectively tied" — identical names produce bit-identical doubles, so
 * a tiny epsilon only guards against floating-point noise.
 */
const TIER7_TIE_EPSILON = 1e-9;

export type MatchIndexes = {
  policyByNumber: Map<string, CrmPolicy[]>;
  policyByNpn: Map<string, CrmPolicy[]>;
  policyByDob: Map<string, CrmPolicy[]>;
  policyById: Map<string, CrmPolicy>;
};

export const buildMatchIndexes = (policies: CrmPolicy[]): MatchIndexes => {
  const policyByNumber = new Map<string, CrmPolicy[]>();
  const policyByNpn = new Map<string, CrmPolicy[]>();
  const policyByDob = new Map<string, CrmPolicy[]>();
  const policyById = new Map<string, CrmPolicy>();

  for (const p of policies) {
    policyById.set(p.id, p);

    // Index keys are normalized (trim + uppercase / date-only) so
    // hand-entered CRM variants still hit exact-identifier lookups. The
    // policy snapshots themselves keep their raw values.
    const policyNumberKey = normalizePolicyNumber(p.policyNumber);

    if (policyNumberKey) {
      const existing = policyByNumber.get(policyNumberKey) ?? [];

      existing.push(p);
      policyByNumber.set(policyNumberKey, existing);
    }

    const agentNpn = p['agent.npn'];

    if (agentNpn) {
      const existing = policyByNpn.get(agentNpn) ?? [];

      existing.push(p);
      policyByNpn.set(agentNpn, existing);
    }

    const leadDob = normalizeDateOnly(p['lead.dateOfBirth']);

    if (leadDob) {
      const existing = policyByDob.get(leadDob) ?? [];

      existing.push(p);
      policyByDob.set(leadDob, existing);
    }
  }

  return { policyByNumber, policyByNpn, policyByDob, policyById };
};

// Statuses that mean "this policy is over" — shared home in
// types/policy-statuses.ts (Phase 4.4 consolidated the three previously
// drift-prone copies). When narrowing multi-policy-number candidates,
// prefer the unique non-terminal candidate over a terminal one —
// re-enrollments add a new active policy alongside the canceled prior
// version, and the BOB row almost always describes the active one.

/**
 * When multiple CRM policies share a policyNumber and exactly one is in a
 * non-terminal state, return that candidate. The terminal one is the
 * canceled/declined prior version; the BOB row almost always describes
 * the active replacement.
 *
 * Returns null when 0 or >1 candidates are non-terminal (caller falls
 * back to other narrowing strategies).
 */
export const selectByActiveStatus = (
  candidates: CrmPolicy[],
): CrmPolicy | null => {
  if (candidates.length < 2) return null;

  const active = candidates.filter(
    (p) => !p.status || !NEGATIVE_TERMINAL_STATUSES.has(p.status),
  );

  return active.length === 1 ? active[0] : null;
};

/**
 * When multiple CRM policies share a policyNumber (typical for renewals
 * where carriers carry the same number forward across plan years), narrow
 * to the candidate whose [effectiveDate, expirationDate ?? ∞] term-window
 * contains the BOB row's `paid_through_date`.
 *
 * This avoids tier-2/3 picking the canceled prior-term record on renewals
 * where the BOB still reports the original `policy_effective_date`.
 *
 * Returns the unique winner, or null when 0 or >1 candidates qualify
 * (caller falls back to existing date-proximity ranking).
 */
export const selectByActiveTerm = (
  candidates: CrmPolicy[],
  bobPaidThroughDate: string | null,
): CrmPolicy | null => {
  if (!bobPaidThroughDate || candidates.length < 2) return null;

  const paid = new Date(bobPaidThroughDate).getTime();

  if (Number.isNaN(paid)) return null;

  const matches = candidates.filter((p) => {
    if (!p.effectiveDate) return false;

    const eff = new Date(p.effectiveDate).getTime();

    if (Number.isNaN(eff) || paid < eff) return false;
    if (!p.expirationDate) return true;

    const exp = new Date(p.expirationDate).getTime();

    return Number.isNaN(exp) ? false : paid <= exp;
  });

  return matches.length === 1 ? matches[0] : null;
};

/**
 * Last-resort narrowing for multi-policy-number candidates: pick the most
 * recently effective policy. Encodes the ops rule "anytime we have
 * multiples, update the most recent one" — when neither status nor term
 * window disambiguates (e.g. the member re-enrolled mid-year and BOTH
 * versions sit CANCELED in the CRM), the BOB row describes the member's
 * current relationship with the carrier, and the latest policy is the one
 * to update. Without this, the proximity tiers latch onto the OLDER
 * policy because the BOB carries the original effective date.
 *
 * Restricted to candidate sets where ALL candidates are in terminal
 * states — the case that motivated the heuristic. When any candidate is
 * still live (e.g. a current ACTIVE term plus a future-dated renewal
 * record), recency must NOT preempt the effective-date/agent evidence the
 * proximity tiers evaluate, or the newer record shadows the active term
 * the BOB row actually describes.
 *
 * Returns null when any candidate is non-terminal, lacks a parseable
 * effectiveDate, or when the latest date is shared by more than one
 * candidate (true tie — caller falls back to weighted multi-match scoring).
 */
export const selectByMostRecentEffectiveDate = (
  candidates: CrmPolicy[],
): CrmPolicy | null => {
  if (candidates.length < 2) return null;

  const allTerminal = candidates.every(
    (p) => p.status !== null && NEGATIVE_TERMINAL_STATUSES.has(p.status),
  );

  if (!allTerminal) return null;

  const dated = candidates.map((p) => ({
    policy: p,
    time: p.effectiveDate ? new Date(p.effectiveDate).getTime() : NaN,
  }));

  if (dated.some(({ time }) => Number.isNaN(time))) return null;

  dated.sort((a, b) => b.time - a.time);

  return dated[0].time > dated[1].time ? dated[0].policy : null;
};

export const matchRow = (
  input: MatchInput,
  indexes: MatchIndexes,
  overrides: Override[],
  carrierName: string,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): MatchDecision => {
  const tolerance = config.dateToleranceDays;
  // Comparison forms — index keys are normalized the same way (see
  // buildMatchIndexes), so exact-identifier lookups survive case/format
  // variance in hand-entered CRM data.
  const inputPolicyNumber = normalizePolicyNumber(input.policyNumber);
  const inputDob = normalizeDateOnly(input.memberDob);

  // Tier 1: Override check
  if (isTierEnabled('OVERRIDE', config) && inputPolicyNumber) {
    const override = overrides.find(
      (o) =>
        o.isActive &&
        normalizePolicyNumber(o.carrierPolicyNumber) === inputPolicyNumber &&
        o.carrierName.toLowerCase() === carrierName.toLowerCase(),
    );

    if (override) {
      const policy = indexes.policyById.get(override.crmPolicyId);

      return {
        crmPolicyId: override.crmPolicyId,
        crmPolicyNumber: policy?.policyNumber ?? null,
        confidence: 100,
        method: 'OVERRIDE',
        status: 'AUTO_MATCHED',
        notes: `Manual override: carrier policy ${inputPolicyNumber} → CRM policy ${override.crmPolicyId}`,
      };
    }
  }

  // Find all policies with matching policy number
  const allPolicyNumberMatches = inputPolicyNumber
    ? (indexes.policyByNumber.get(inputPolicyNumber) ?? [])
    : [];

  // Disambiguate multi-policy-number candidates BEFORE running proximity-
  // based tiers. Three narrowing strategies, in priority order:
  //
  //   1. Active-status: when exactly one candidate isn't in a terminal
  //      state (CANCELED / DECLINED / etc.), pick it. Re-enrollments add
  //      a new active policy alongside the canceled prior; without this,
  //      tier 5 (single) would happily lock onto the canceled one when
  //      neither date nor agent disambiguates.
  //   2. Term-window: when status alone doesn't disambiguate (e.g. both
  //      candidates active mid-transition), fall back to picking the
  //      candidate whose [effectiveDate, expirationDate] contains the
  //      BOB paid-through date — handles renewals where the BOB carries
  //      forward the old policy_effective_date.
  //   3. Most-recent: when neither status nor term window decides (e.g.
  //      both versions canceled in the CRM), pick the latest effective
  //      date — "anytime we have multiples, update the most recent one".
  let narrowedWinner: CrmPolicy | null = null;
  let narrowReason: string | null = null;
  let narrowedByRecency = false;

  if (allPolicyNumberMatches.length > 1) {
    const activeWinner = selectByActiveStatus(allPolicyNumberMatches);
    const termWinner = activeWinner
      ? null
      : selectByActiveTerm(allPolicyNumberMatches, input.paidThroughDate);
    const recentWinner =
      activeWinner || termWinner
        ? null
        : selectByMostRecentEffectiveDate(allPolicyNumberMatches);

    if (activeWinner) {
      narrowedWinner = activeWinner;
      narrowReason = 'active status';
    } else if (termWinner) {
      narrowedWinner = termWinner;
      narrowReason = `paid-through ${input.paidThroughDate}`;
    } else if (recentWinner) {
      narrowedWinner = recentWinner;
      narrowReason = 'most recent effective date';
      narrowedByRecency = true;
    }
  }

  const policyNumberMatches = narrowedWinner
    ? [narrowedWinner]
    : allPolicyNumberMatches;
  const narrowSuffix = narrowedWinner
    ? ` (disambiguated from ${allPolicyNumberMatches.length} candidates by ${narrowReason})`
    : '';

  // A recency-narrowed winner is an ops heuristic ("update the most recent
  // one"), not an identifier match — yet it would otherwise inherit Tier
  // 2-5 confidence (85-98) and their methods. Tag it with a distinct
  // method and cap confidence below the auto-match threshold so review
  // filters, batch approval, and learned rules can tell heuristic
  // narrowing apart from a genuinely unique match.
  const finalizeNarrowedDecision = (decision: MatchDecision): MatchDecision => {
    if (!narrowedByRecency) return decision;

    return {
      ...decision,
      confidence: Math.min(decision.confidence, config.autoMatchThreshold - 1),
      method: 'POLICY_NUMBER_NARROWED_RECENT',
      status: 'NEEDS_REVIEW',
      notes: `${decision.notes} — recency narrowing is heuristic; confidence capped below auto-match threshold`,
    };
  };

  if (policyNumberMatches.length > 0) {
    // Tier 2: Policy number + effective date + agent name (3-signal)
    if (
      isTierEnabled('POLICY_NUMBER_DATE_AGENT', config) &&
      input.effectiveDate &&
      input.agentName
    ) {
      const tripleMatches = policyNumberMatches.filter(
        (p) =>
          datesWithinDays(p.effectiveDate, input.effectiveDate, tolerance) &&
          agentNameMatches(
            input.agentName,
            p['agent.name'],
            config.agentNameThreshold,
          ),
      );

      if (tripleMatches.length === 1) {
        const match = tripleMatches[0];

        return finalizeNarrowedDecision({
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence: 98,
          method: 'POLICY_NUMBER_DATE_AGENT',
          status: classifyConfidence(98, config),
          notes: `3-signal match: policy number + effective date (BOB: ${input.effectiveDate}, CRM: ${match.effectiveDate}) + agent "${input.agentName}"→"${match['agent.name']}"${narrowSuffix}`,
        });
      }
    }

    // Tier 3: Policy number + effective date
    if (isTierEnabled('POLICY_NUMBER_DATE', config) && input.effectiveDate) {
      const dateMatches = policyNumberMatches.filter((p) =>
        datesWithinDays(p.effectiveDate, input.effectiveDate, tolerance),
      );

      if (dateMatches.length === 1) {
        const match = dateMatches[0];

        return finalizeNarrowedDecision({
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence: 95,
          method: 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE',
          status: classifyConfidence(95, config),
          notes: `Policy number matched, effective dates within ${tolerance} days (BOB: ${input.effectiveDate}, CRM: ${match.effectiveDate})${narrowSuffix}`,
        });
      }
    }

    // Tier 4: Policy number + agent name (fuzzy)
    if (isTierEnabled('POLICY_NUMBER_AGENT', config) && input.agentName) {
      const agentMatches = policyNumberMatches.filter((p) =>
        agentNameMatches(
          input.agentName,
          p['agent.name'],
          config.agentNameThreshold,
        ),
      );

      if (agentMatches.length === 1) {
        const match = agentMatches[0];

        return finalizeNarrowedDecision({
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence: 85,
          method: 'POLICY_NUMBER_PLUS_AGENT',
          status: classifyConfidence(85, config),
          notes: `Policy number matched, broker "${input.agentName}" matched agent "${match['agent.name']}"${narrowSuffix}`,
        });
      }
    }

    // Tier 5: Single policy number match
    // When exactly one CRM policy has this carrier policy number, it's a
    // definitive identifier match — the Ambetter U-number is unique per member.
    if (
      isTierEnabled('POLICY_NUMBER_SINGLE', config) &&
      policyNumberMatches.length === 1
    ) {
      const match = policyNumberMatches[0];

      return finalizeNarrowedDecision({
        crmPolicyId: match.id,
        crmPolicyNumber: match.policyNumber,
        confidence: 90,
        method: 'POLICY_NUMBER_SINGLE',
        status: classifyConfidence(90, config),
        notes: `Single CRM policy matched by policy number "${inputPolicyNumber}"${narrowSuffix}`,
      });
    }

    // Tier 6: Multi-match disambiguation
    if (
      isTierEnabled('POLICY_NUMBER_MULTI_BEST', config) &&
      policyNumberMatches.length > 1
    ) {
      const scored = policyNumberMatches.map((p) => {
        let score = 0;

        score += dateProximityScore(p.effectiveDate, input.effectiveDate) * 40;

        if (
          agentNameMatches(
            input.agentName,
            p['agent.name'],
            config.agentNameThreshold,
          )
        ) {
          score += 30;
        }

        const nameScore = memberNameScore(
          input.memberFirstName,
          input.memberLastName,
          p['lead.name.firstName'],
          p['lead.name.lastName'],
        );

        score += nameScore * 20;

        const leadDob = normalizeDateOnly(p['lead.dateOfBirth']);

        if (inputDob && leadDob && inputDob === leadDob) {
          score += 10;
        }

        return { policy: p, score };
      });

      scored.sort((a, b) => b.score - a.score);

      const best = scored[0];
      const confidence = Math.min(Math.round(best.score), 70);

      return {
        crmPolicyId: best.policy.id,
        crmPolicyNumber: best.policy.policyNumber,
        confidence,
        method: 'POLICY_NUMBER_MULTI_BEST',
        status: classifyConfidence(confidence, config),
        notes: `Multiple CRM policies (${policyNumberMatches.length}) matched. Best by weighted score (${best.score.toFixed(1)}): date proximity + agent + member identity`,
      };
    }
  }

  // Tier 7: NPN + effective date + name similarity
  if (
    isTierEnabled('NPN_DATE_NAME', config) &&
    input.agentNpn &&
    input.effectiveDate &&
    input.memberFirstName &&
    input.memberLastName
  ) {
    const npnCandidates = indexes.policyByNpn.get(input.agentNpn) ?? [];
    const npnMatches = npnCandidates.filter((p) =>
      datesWithinDays(p.effectiveDate, input.effectiveDate, tolerance),
    );

    // The NPN covers the whole agency book and the date filter spans the
    // enrollment window, so many members can qualify. Score ALL candidates
    // and pick the best name match (deterministic tie-break: higher score,
    // then exact DOB corroboration, then lowest policy id) — first-match-
    // wins attached one member's BOB data to a near-name neighbor's policy.
    const scored = npnMatches
      .map((p) => ({
        policy: p,
        nameScore: memberNameScore(
          input.memberFirstName,
          input.memberLastName,
          p['lead.name.firstName'],
          p['lead.name.lastName'],
        ),
        dobConfirmed:
          inputDob !== null &&
          normalizeDateOnly(p['lead.dateOfBirth']) === inputDob,
      }))
      .filter((c) => c.nameScore >= config.tier7MinNameScore)
      .sort(
        (a, b) =>
          b.nameScore - a.nameScore ||
          Number(b.dobConfirmed) - Number(a.dobConfirmed) ||
          a.policy.id.localeCompare(b.policy.id),
      );

    if (scored.length > 0) {
      const best = scored[0];
      const runnerUp = scored.length > 1 ? scored[1] : null;

      // Dynamic confidence based on name quality:
      // NPN confirms same agent, date confirms same enrollment window.
      // Name similarity is the remaining signal — high similarity means
      // this is almost certainly the same person.
      const bands = config.tier7NameBands;
      const bandScores = config.tier7ConfidenceScores;
      let confidence =
        best.nameScore >= bands.high
          ? bandScores.high
          : best.nameScore >= bands.medium
            ? bandScores.medium
            : bandScores.low;

      // memberDob corroboration: NPN + enrollment window + name similarity
      // + exact DOB is strong identity evidence — lift the confidence to
      // at least the medium band.
      if (best.dobConfirmed) {
        confidence = Math.max(confidence, bandScores.medium);
      }

      const tied =
        runnerUp !== null &&
        Math.abs(best.nameScore - runnerUp.nameScore) < TIER7_TIE_EPSILON;
      const dobBreaksTie =
        best.dobConfirmed && runnerUp?.dobConfirmed === false;

      if (tied && !dobBreaksTie) {
        // Two candidates the engine cannot tell apart (same name score, DOB
        // doesn't single one out) — never auto-attach one member's BOB data
        // to a same-named neighbor's policy.
        return {
          crmPolicyId: best.policy.id,
          crmPolicyNumber: best.policy.policyNumber,
          confidence: Math.min(confidence, config.autoMatchThreshold - 1),
          method: 'NPN_DATE_NAME',
          status: 'NEEDS_REVIEW',
          notes: `NPN-based match ambiguous: top candidates tied on name similarity ${best.nameScore.toFixed(2)} (broker NPN ${input.agentNpn}, ${scored.length} candidates above threshold) with no DOB tie-breaker — picked lowest policy id, needs review`,
        };
      }

      return {
        crmPolicyId: best.policy.id,
        crmPolicyNumber: best.policy.policyNumber,
        confidence,
        method: 'NPN_DATE_NAME',
        status: classifyConfidence(confidence, config),
        notes: `NPN-based match: broker NPN ${input.agentNpn}, name similarity ${best.nameScore.toFixed(2)}${best.dobConfirmed ? ', DOB corroborated' : ''}, effective date within ${tolerance} days (best of ${scored.length} candidate${scored.length === 1 ? '' : 's'} above threshold)`,
      };
    }
  }

  // Tier 8: Name + DOB + effective date
  if (
    isTierEnabled('NAME_DOB_DATE', config) &&
    input.memberFirstName &&
    input.memberLastName &&
    inputDob &&
    input.effectiveDate
  ) {
    const dobCandidates = indexes.policyByDob.get(inputDob) ?? [];

    // Same best-of selection as Tier 7: multiple leads can share a DOB, so
    // score every candidate instead of returning the first one above the
    // threshold (deterministic tie-break: higher name score, then lowest
    // policy id). DOB comparison is normalized to 'YYYY-MM-DD' on both
    // sides so ISO-timestamp CRM values still match plain dates.
    const qualified = dobCandidates
      .filter(
        (p) =>
          normalizeDateOnly(p['lead.dateOfBirth']) === inputDob &&
          datesWithinDays(p.effectiveDate, input.effectiveDate, tolerance),
      )
      .map((p) => ({
        policy: p,
        nameScore: memberNameScore(
          input.memberFirstName,
          input.memberLastName,
          p['lead.name.firstName'],
          p['lead.name.lastName'],
        ),
      }))
      .filter((c) => c.nameScore >= config.nameMatchThreshold)
      .sort(
        (a, b) =>
          b.nameScore - a.nameScore || a.policy.id.localeCompare(b.policy.id),
      );

    if (qualified.length > 0) {
      const best = qualified[0];

      return {
        crmPolicyId: best.policy.id,
        crmPolicyNumber: best.policy.policyNumber,
        confidence: 60,
        method: 'NAME_DOB_DATE',
        status: classifyConfidence(60, config),
        notes: `Identity-based match: name similarity ${best.nameScore.toFixed(2)}, DOB ${inputDob} exact match, effective date within ${tolerance} days (best of ${qualified.length} candidate${qualified.length === 1 ? '' : 's'} above threshold)`,
      };
    }
  }

  // Tier 9: Unmatched — provide candidate suggestions
  const candidates: string[] = [];

  if (policyNumberMatches.length > 0) {
    candidates.push(
      `${policyNumberMatches.length} policies share policy number "${inputPolicyNumber}" but could not be disambiguated`,
    );
  }

  return {
    crmPolicyId: null,
    crmPolicyNumber: null,
    confidence: 0,
    method: 'UNMATCHED',
    status: 'UNMATCHED',
    notes:
      candidates.length > 0
        ? `Unmatched. ${candidates.join('. ')}`
        : `No CRM policy found for carrier policy "${inputPolicyNumber}"`,
  };
};
