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
  // Identifier-role tier (OMN-12 identity): only emitted when
  // matchingConfig.identifierRoles is configured. The matching reviewItem
  // matchMethod SELECT option is seeded by seed-reconciliation-objects;
  // re-run the seed before enabling identifierRoles on a workspace.
  | 'IDENTIFIER_EXACT'
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
  // Identifier roles (OMN-12 identity, audit 2026-06-11 §"Identity is
  // single-role and policy-number-shaped"): carriers whose files key people
  // by member/subscriber/group IDs feed these via the per-carrier
  // matchingConfig.identifierRoles knob (role → CrmPolicy snapshot path) —
  // NOT via MATCHING_ROLE_BY_CRM_FIELD, which only carries the static
  // CRM-path roles. Null (and inert) unless identifierRoles is configured.
  memberId: string | null;
  subscriberId: string | null;
  groupNumber: string | null;
};

// ---------------------------------------------------------------------------
// Identifier roles (OMN-12 identity)
// ---------------------------------------------------------------------------

/**
 * The identifier-role vocabulary, in PRIORITY order: when a row carries more
 * than one configured identifier, `matchRow`'s IDENTIFIER_EXACT tier and
 * `resolveCarrierIdentifier` try memberId first, then subscriberId, then
 * groupNumber.
 */
export const IDENTIFIER_ROLES = [
  'memberId',
  'subscriberId',
  'groupNumber',
] as const;

export type IdentifierRole = (typeof IDENTIFIER_ROLES)[number];

/**
 * CRM snapshot paths an identifier role may target. Restricted to the real
 * identifier-bearing policy fields `fetchPoliciesForMatching` provides on
 * `CrmPolicy` (data.service.ts) — an arbitrary dot-path would silently index
 * nothing, so the config boundary validates against this list.
 * `policyNumber` is deliberately excluded: it is already the policyNumber
 * role; aliasing it through identifierRoles would just duplicate the
 * existing tiers.
 */
export const IDENTIFIER_ROLE_CRM_FIELDS = [
  'applicationId',
  'planIdentifier',
  'externalPolicyId',
] as const;

export type IdentifierRoleCrmField =
  (typeof IDENTIFIER_ROLE_CRM_FIELDS)[number];

/**
 * Per-carrier identifier-role wiring (matchingConfig.identifierRoles):
 * role → CrmPolicy snapshot path. `{}` (the default) keeps the engine
 * policy-number-only — the IDENTIFIER_EXACT tier never runs and the new
 * MatchInput fields stay null, preserving existing behavior bit-for-bit.
 */
export type IdentifierRolesConfig = Partial<
  Record<IdentifierRole, IdentifierRoleCrmField>
>;

/**
 * Configured (role, crmField) pairs in IDENTIFIER_ROLES priority order.
 * Single home for the iteration used by `buildMatchIndexes`,
 * `buildMatchInputFromMapping`, `resolveCarrierIdentifier`, and the
 * IDENTIFIER_EXACT tier so they can never disagree on priority.
 */
export const configuredIdentifierRoleEntries = (
  identifierRoles: IdentifierRolesConfig | undefined,
): [IdentifierRole, IdentifierRoleCrmField][] =>
  IDENTIFIER_ROLES.flatMap((role) => {
    const crmField = identifierRoles?.[role];

    return crmField
      ? [[role, crmField] as [IdentifierRole, IdentifierRoleCrmField]]
      : [];
  });

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
// registry above — EXCEPT the identifier roles, which are deliberately not
// static registry entries: their CRM path is per-carrier configuration
// (matchingConfig.identifierRoles), so `buildMatchInputFromMapping` resolves
// them from that knob instead. If you add any other role without an entry,
// this line errors with "Type 'X' does not satisfy the constraint 'never'".
type _Assert<T extends never> = T;
type _UncoveredMatchInputRoles = Exclude<
  keyof MatchInput,
  | (typeof MATCHING_ROLE_BY_CRM_FIELD)[keyof typeof MATCHING_ROLE_BY_CRM_FIELD]
  | IdentifierRole
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

// ---------------------------------------------------------------------------
// Per-carrier identifier canonicalization (OMN-12 identity; audit 2026-06-11
// §"policyNumberPattern is gate-only; normalization fixed at trim+uppercase")
// ---------------------------------------------------------------------------

/**
 * Per-carrier normalization applied AFTER trim+uppercase, on BOTH the
 * file side and the CRM side (index keys, lookups, override compares) so
 * exact-identifier matches stay symmetric. All knobs default to no-ops.
 */
export type IdentifierNormalization = {
  /** Strip leading '0's (always keeping at least one character). Applied
   *  last, after prefix/suffix strips. Default: false. */
  stripLeadingZeros?: boolean;
  /** Literal prefix removed when present (compared case-insensitively —
   *  values are uppercased first). */
  stripPrefix?: string;
  /** Regex (validated at the config boundary, compiled case-insensitive)
   *  whose first match is removed — anchor with `$` for true suffixes,
   *  e.g. '-\\d+$' for BCBS member suffixes ('…-01'). */
  stripSuffixPattern?: string;
};

export type IdentifierCanonicalizer = (
  value: string | null | undefined,
) => string | null;

/** Number of capturing groups in a regex (the empty-alternation trick:
 *  `(re|)` matches '' at position 0 with every group undefined, so the
 *  result length reveals the group count without parsing the source). */
const countCaptureGroups = (pattern: RegExp): number =>
  (new RegExp(`${pattern.source}|`).exec('') as RegExpExecArray).length - 1;

/**
 * Build the per-carrier canonical-identifier function:
 *
 *   1. trim + uppercase (`normalizePolicyNumber` — today's behavior),
 *   2. when `pattern` (the carrier's compiled policyNumberPattern) contains
 *      a capture group and matches the value, the FIRST group's match
 *      replaces the value ("compare on the digits after the plan prefix");
 *      non-matching values — typically the CRM side, which often stores the
 *      bare identifier — skip extraction but still get step 3, keeping both
 *      sides symmetric,
 *   3. `identifierNormalization` strips: prefix, then suffix pattern, then
 *      leading zeros.
 *
 * When no knob is active (a pattern without capture groups — Ambetter's
 * '^U', Oscar's '^OSC-' — and default normalization) this returns
 * `normalizePolicyNumber` ITSELF, so callers can detect "canonicalization
 * active" by reference comparison and existing carriers stay bit-for-bit.
 *
 * NOTE: the match-job gate (skip rows failing policyNumberPattern) keeps
 * testing the UN-canonicalized trim+uppercase value — extraction happens
 * after the gate, so gate semantics are unchanged.
 */
export const buildIdentifierCanonicalizer = (
  pattern: RegExp | null,
  normalization: IdentifierNormalization | null | undefined,
): IdentifierCanonicalizer => {
  const capturePattern =
    pattern !== null && countCaptureGroups(pattern) > 0 ? pattern : null;
  const stripPrefix = normalization?.stripPrefix
    ? normalization.stripPrefix.trim().toUpperCase()
    : null;
  const stripSuffixPattern = normalization?.stripSuffixPattern
    ? new RegExp(normalization.stripSuffixPattern, 'i')
    : null;
  const stripLeadingZeros = normalization?.stripLeadingZeros === true;

  if (
    capturePattern === null &&
    stripPrefix === null &&
    stripSuffixPattern === null &&
    !stripLeadingZeros
  ) {
    // No knob active — the exact pre-knob function, by reference.
    return normalizePolicyNumber;
  }

  return (value) => {
    const normalized = normalizePolicyNumber(value);

    if (normalized === null) return null;

    let canonical = normalized;

    if (capturePattern) {
      const match = canonical.match(capturePattern);

      if (match && match[1] !== undefined && match[1].length > 0) {
        canonical = match[1].toUpperCase();
      }
    }

    if (stripPrefix && canonical.startsWith(stripPrefix)) {
      canonical = canonical.slice(stripPrefix.length);
    }

    if (stripSuffixPattern) {
      canonical = canonical.replace(stripSuffixPattern, '');
    }

    if (stripLeadingZeros) {
      canonical = canonical.replace(/^0+(?=.)/, '');
    }

    canonical = canonical.trim();

    return canonical.length > 0 ? canonical : null;
  };
};

/**
 * The value stamped into review items' `carrierPolicyNumber` (the stable
 * row-identity column — see review-item-reconcile.util.ts) and tested by the
 * match-job's policyNumberPattern gate: the row's policy number when present,
 * otherwise the first configured identifier-role value (IDENTIFIER_ROLES
 * priority order), trim+uppercased. RAW (un-canonicalized) on purpose — the
 * stamped identity must be stable for a given uploaded file regardless of
 * later canonicalization-knob edits, and override learning round-trips
 * through `matchRow`'s canonicalize-both-sides compare.
 *
 * With identifierRoles unset this is exactly `input.policyNumber ?? null` —
 * existing carriers are untouched.
 */
export const resolveCarrierIdentifier = (
  input: MatchInput,
  identifierRoles: IdentifierRolesConfig | undefined,
): string | null => {
  if (input.policyNumber) return input.policyNumber;

  for (const [role] of configuredIdentifierRoleEntries(identifierRoles)) {
    const value = normalizePolicyNumber(input[role]);

    if (value) return value;
  }

  return null;
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
  identifierRoles?: IdentifierRolesConfig,
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
    memberId: null,
    subscriberId: null,
    groupNumber: null,
  };

  // Identifier roles resolve per-carrier (config), not via the static
  // registry: a columnMapping entry whose crmField is a configured
  // identifier path feeds that role. When two roles target the same path,
  // the first in IDENTIFIER_ROLES priority order wins (deterministic).
  const identifierRoleByCrmField = new Map<string, IdentifierRole>();

  for (const [role, crmField] of configuredIdentifierRoleEntries(
    identifierRoles,
  )) {
    if (!identifierRoleByCrmField.has(crmField)) {
      identifierRoleByCrmField.set(crmField, role);
    }
  }

  const resolveRole = (crmField: string): keyof MatchInput | undefined =>
    lookupMatchingRole(crmField) ?? identifierRoleByCrmField.get(crmField);

  // Map from column mapping entries (XLSX header → CRM field → matching role)
  for (const [xlsxHeader, entry] of Object.entries(columnMapping)) {
    const role = resolveRole(entry.crmField);

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
      const role = resolveRole(crmField);

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
  /** External-system policy id (healthsherpa et al.) — identifier-bearing,
   *  so it is a valid identifierRoles target (OMN-12 identity). */
  externalPolicyId: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  paidThroughDate: string | null;
  status: string | null;
  applicantCount: number | null;
  // Currency is stored as integer micros on the CRM (1 USD = 1_000_000)
  'premium.amountMicros': number | null;
  /** Fetched phase-1 since OMN-12 (identifierRoles target); ALSO re-fetched
   *  by phase-2 enrichment, whose value wins in buildPolicyForDiff — diff
   *  output is unchanged. */
  planIdentifier: string | null;
  // Lead (path-keyed)
  'lead.name.firstName': string | null;
  'lead.name.lastName': string | null;
  'lead.dateOfBirth': string | null;
  'lead.addressCustom.addressState': string | null;
  // Agent (path-keyed)
  'agent.name': string | null;
  'agent.npn': string | null;
  // Phase-2 enrichment (defaulted null on initial fetch)
  'lead.phones.primaryPhoneNumber': string | null;
  'lead.emails.primaryEmail': string | null;
  'lead.id': string | null;
};

// Compile-time guard: every identifier-role CRM path must be a real
// CrmPolicy snapshot field (data.service's fetchPoliciesForMatching must
// provide it phase-1, or the identifier index would be built over nulls).
type _UnknownIdentifierRoleCrmFields = Exclude<
  IdentifierRoleCrmField,
  keyof CrmPolicy
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _IdentifierRoleCrmFieldsGuard = _Assert<_UnknownIdentifierRoleCrmFields>;

export type Override = {
  carrierPolicyNumber: string;
  carrierName: string;
  crmPolicyId: string;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Canonical tier ids + per-tier tuning (audit 2026-06-11 §"enabledTiers is an
// unvalidated free-string list", §"Tier internals hardcoded")
// ---------------------------------------------------------------------------

/**
 * Canonical match-tier ids — the EXACT strings the `isTierEnabled` gates in
 * `matchRow` check `matchingConfig.enabledTiers` against. Single source of
 * truth for the boundary validation in types/carrier-config.ts (unknown
 * entries fail the run loudly instead of silently disabling a tier) and for
 * `DEFAULT_MATCHING_CONFIG.enabledTiers`.
 *
 * NOTE: tier ids deliberately differ from some `MatchMethod` values — the
 * 'POLICY_NUMBER_DATE' tier returns method 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE'
 * and 'POLICY_NUMBER_AGENT' returns 'POLICY_NUMBER_PLUS_AGENT'. Pasting a
 * method name into enabledTiers is a validation error, not a tier.
 */
export const MATCH_TIER_IDS = [
  'OVERRIDE',
  'POLICY_NUMBER_DATE_AGENT',
  'POLICY_NUMBER_DATE',
  'POLICY_NUMBER_AGENT',
  'POLICY_NUMBER_SINGLE',
  'POLICY_NUMBER_MULTI_BEST',
  // Identifier-role tier (OMN-12 identity). In MATCH_TIER_IDS (so
  // enabledTiers validates and can disable it) but ADDITIONALLY gated on
  // matchingConfig.identifierRoles being configured — see the gating note
  // in matchRow.
  'IDENTIFIER_EXACT',
  'NPN_DATE_NAME',
  'NAME_DOB_DATE',
] as const;

export type MatchTierId = (typeof MATCH_TIER_IDS)[number];

/**
 * Tiers whose base confidence is a flat per-tier constant and therefore
 * tunable via `tierTuning.tierConfidences`. Excluded by design:
 * OVERRIDE (always 100 — manual pin must stay above every heuristic),
 * POLICY_NUMBER_MULTI_BEST (weighted score, governed by `tier6Weights`),
 * NPN_DATE_NAME (already banded via `tier7ConfidenceScores`).
 */
export type TierConfidenceId = Exclude<
  MatchTierId,
  'OVERRIDE' | 'POLICY_NUMBER_MULTI_BEST' | 'NPN_DATE_NAME'
>;

export const TIER_CONFIDENCE_IDS = [
  'POLICY_NUMBER_DATE_AGENT',
  'POLICY_NUMBER_DATE',
  'POLICY_NUMBER_AGENT',
  'POLICY_NUMBER_SINGLE',
  'IDENTIFIER_EXACT',
  'NAME_DOB_DATE',
] as const satisfies readonly TierConfidenceId[];

// Compile-time guard: TIER_CONFIDENCE_IDS must cover every TierConfidenceId
// (adding a tier to MATCH_TIER_IDS without classifying it here errors).
type _UncoveredTierConfidenceIds = Exclude<
  TierConfidenceId,
  (typeof TIER_CONFIDENCE_IDS)[number]
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _TierConfidenceIdsCoverageGuard = _Assert<_UncoveredTierConfidenceIds>;

/** Tier-6 (POLICY_NUMBER_MULTI_BEST) weighted-score knobs. */
export type Tier6Weights = {
  /** Multiplier on the date-proximity score (0..1). Default: 40 */
  dateProximity: number;
  /** Flat bonus when the BOB broker fuzzy-matches the CRM agent. Default: 30 */
  agentMatch: number;
  /** Multiplier on the member-name score (0..1). Default: 20 */
  memberName: number;
  /** Flat bonus for an exact (normalized) DOB match. Default: 10 */
  dobExact: number;
  /** Hard cap on Tier-6 confidence. Default: 70 (kept below the default
   *  auto-match threshold by design — multi-match is a heuristic). */
  confidenceCap: number;
};

/** One date-proximity band: score credited when the effective-date diff is
 *  <= maxDays (bands are evaluated in ascending maxDays order). */
export type DateProximityBand = {
  maxDays: number;
  score: number;
};

/**
 * Optional per-carrier overrides for the previously hardcoded tier internals
 * (OMN-12). Every knob defaults to today's constants (DEFAULT_TIER_TUNING) —
 * a missing key keeps Ambetter behavior bit-for-bit. Stored configs are
 * validated at the boundary (types/carrier-config.ts).
 */
export type TierTuning = {
  /** Per-tier base confidence overrides; missing keys keep the constants. */
  tierConfidences?: Partial<Record<TierConfidenceId, number>>;
  /** Tier-6 weighted-score overrides; missing keys keep the constants. */
  tier6Weights?: Partial<Tier6Weights>;
  /** Tier-6 date-proximity bands (replaces the whole table when set). */
  dateProximityBands?: DateProximityBand[];
  /** Score when the date diff exceeds every band. Default: 0.1 */
  dateProximityFloor?: number;
};

/**
 * Today's hardcoded tier internals, now the single named home for the
 * constants `matchRow` used as literals (98/95/85/90/60, the 40/30/20/10
 * tier-6 weights with the 70 cap, and the 0/7/30/60-day proximity bands).
 * `tierTuning` knobs fall back to these per key, so an unset or partial
 * tierTuning is bit-for-bit identical to the pre-knob behavior.
 */
export const DEFAULT_TIER_TUNING: {
  tierConfidences: Record<TierConfidenceId, number>;
  tier6Weights: Tier6Weights;
  dateProximityBands: readonly DateProximityBand[];
  dateProximityFloor: number;
} = {
  tierConfidences: {
    POLICY_NUMBER_DATE_AGENT: 98,
    POLICY_NUMBER_DATE: 95,
    POLICY_NUMBER_AGENT: 85,
    POLICY_NUMBER_SINGLE: 90,
    // Mirrors POLICY_NUMBER_SINGLE's rationale: a unique exact-identifier
    // hit is definitive. Only read when identifierRoles is configured.
    IDENTIFIER_EXACT: 90,
    NAME_DOB_DATE: 60,
  },
  tier6Weights: {
    dateProximity: 40,
    agentMatch: 30,
    memberName: 20,
    dobExact: 10,
    confidenceCap: 70,
  },
  dateProximityBands: [
    { maxDays: 0, score: 1 },
    { maxDays: 7, score: 0.9 },
    { maxDays: 30, score: 0.7 },
    { maxDays: 60, score: 0.4 },
  ],
  dateProximityFloor: 0.1,
};

// ---------------------------------------------------------------------------
// Post-match strategies (OMN-12; audit 2026-06-11 §"Multi-candidate narrowing
// chain and dedup keep-newest policy encode Ambetter renewal/payment
// semantics")
// ---------------------------------------------------------------------------

/**
 * Per-carrier dedup policy for multiple BOB rows matching one CRM policy
 * (match.job dedupPendingByPolicyId):
 *   - keepNewestEffectiveDate (default — today's behavior): keep the row
 *     with the newest effective date; older rows are handled by the
 *     cancel-previous-version logic on the kept row (Ambetter renewals),
 *   - keepAll: every row becomes its own review item (member-level files —
 *     one row per covered dependent). Review-item identity is kept unique
 *     by a '#ROW<n>' suffix on the stamped carrierPolicyNumber,
 *   - keepFirst: keep the first row in file order.
 */
export const DEDUP_STRATEGIES = [
  'keepNewestEffectiveDate',
  'keepAll',
  'keepFirst',
] as const;

export type DedupStrategy = (typeof DEDUP_STRATEGIES)[number];

/**
 * The multi-candidate narrowing strategies `matchRow` may run, by id:
 *   - activeStatus → selectByActiveStatus (unique non-terminal candidate),
 *   - activeTerm → selectByActiveTerm (term window contains BOB
 *     paid-through),
 *   - mostRecentEffectiveDate → selectByMostRecentEffectiveDate (all
 *     candidates terminal → latest effective date; the winner is finalized
 *     as heuristic: POLICY_NUMBER_NARROWED_RECENT + capped confidence).
 *
 * `matchingConfig.narrowingStrategies` is an ordered subset; the default
 * reproduces today's fixed chain (activeStatus → activeTerm →
 * mostRecentEffectiveDate). An empty array disables narrowing entirely
 * (multi-candidate sets fall through to the proximity tiers).
 */
export const NARROWING_STRATEGY_IDS = [
  'activeStatus',
  'activeTerm',
  'mostRecentEffectiveDate',
] as const;

export type NarrowingStrategyId = (typeof NARROWING_STRATEGY_IDS)[number];

export type MatchingConfig = {
  enabledTiers: MatchTierId[];
  autoMatchThreshold: number;
  autoRejectThreshold: number;
  dateToleranceDays: number;
  nameMatchThreshold: number;
  /** When true, detect active CRM policies missing from the BOB (2-way
   *  reconciliation — the match job's missing-from-BOB phase, scoped by
   *  statusVocabulary.activeStatuses). Default: false (1-way).
   *  CAUTION: keep this OFF for carriers that deliver one period as multiple
   *  files (per-state extracts, active+termed splits) — each reconciliation
   *  pins exactly ONE source file, so policies living in the other file(s)
   *  would all be flagged missing. See docs/reconciliation/
   *  carrier-onboarding.md §"Two-way reconciliation". */
  enableMissingFromBob: boolean;
  /** When true, run the policy-number discovery phase after matching:
   *  unmatched BOB rows are paired to CRM policies that lack a carrier-shaped
   *  policy number, by exact DOB + fuzzy name (combinedNameFuzzyMatch),
   *  emitting POLICY_NUMBER_DISCOVERY review items that propose the row's
   *  policy number as a field diff. Default: false (ported from the legacy
   *  payment-reconciliation app, where the phase always ran). */
  enableDiscovery: boolean;
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
  /** Minimum combined-name score (0–1 Jaro-Winkler scale) for the discovery
   *  phase to SUGGEST a policy number. Only read when enableDiscovery is
   *  true. Default: 0.95 (the legacy app's hardcoded literal). */
  discoveryNameThreshold: number;
  /** Name score (0–1) at or above which a discovery item keeps its full
   *  confidence (legacy AUTO_MATCHED); below it, confidence is capped under
   *  autoMatchThreshold so batch approval never sweeps a mere suggestion.
   *  Only read when enableDiscovery is true. Default: 0.98 (legacy literal). */
  discoveryAutoThreshold: number;
  /** Per-tier confidence/weight overrides (OMN-12). `{}` (the default) =
   *  today's hardcoded constants — see DEFAULT_TIER_TUNING. */
  tierTuning?: TierTuning;
  /** Identifier role → CrmPolicy snapshot path (OMN-12 identity). `{}`
   *  (the default) keeps matching policy-number-only — the
   *  IDENTIFIER_EXACT tier never runs. */
  identifierRoles?: IdentifierRolesConfig;
  /** Per-carrier identifier canonicalization knobs applied after
   *  trim+uppercase on BOTH sides (OMN-12 identity). `{}` = no-ops. */
  identifierNormalization?: IdentifierNormalization;
  /** Dedup policy for multiple BOB rows matching one CRM policy.
   *  Default: 'keepNewestEffectiveDate' (today's behavior). */
  dedupStrategy: DedupStrategy;
  /** Ordered multi-candidate narrowing chain. Default: today's fixed
   *  activeStatus → activeTerm → mostRecentEffectiveDate order. */
  narrowingStrategies: NarrowingStrategyId[];
};

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  enabledTiers: [...MATCH_TIER_IDS],
  // Shared with the review UI's high-confidence batch-apply scope (2.7).
  autoMatchThreshold: RECONCILIATION_DEFAULT_AUTO_MATCH_THRESHOLD,
  autoRejectThreshold: 30,
  dateToleranceDays: 30,
  nameMatchThreshold: 0.88,
  enableMissingFromBob: false,
  enableDiscovery: false,
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
  // Empty = read every knob from DEFAULT_TIER_TUNING (today's constants).
  tierTuning: {},
  // Empty = policy-number-only identity (the IDENTIFIER_EXACT tier and the
  // identifier MatchInput roles stay inert) — today's behavior.
  identifierRoles: {},
  // Empty = trim+uppercase only — today's behavior.
  identifierNormalization: {},
  dedupStrategy: 'keepNewestEffectiveDate',
  narrowingStrategies: ['activeStatus', 'activeTerm', 'mostRecentEffectiveDate'],
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

/**
 * Tier-6 date-proximity score. `bands` must be sorted ascending by maxDays
 * (the caller sorts once per row); the first band whose maxDays covers the
 * diff wins, otherwise `floor`. Defaults (DEFAULT_TIER_TUNING) reproduce the
 * historical literals: 0d→1, ≤7d→0.9, ≤30d→0.7, ≤60d→0.4, else 0.1.
 */
const dateProximityScore = (
  dateA: string | null,
  dateB: string | null,
  bands: readonly DateProximityBand[],
  floor: number,
): number => {
  if (!dateA || !dateB) {
    return 0;
  }

  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  const diffDays = Math.abs(a - b) / (1000 * 60 * 60 * 24);

  for (const band of bands) {
    if (diffDays <= band.maxDays) return band.score;
  }

  return floor;
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

const isTierEnabled = (tier: MatchTierId, config: MatchingConfig): boolean =>
  config.enabledTiers.includes(tier);

/**
 * Per-tier base confidence: the carrier's tierTuning override when set,
 * otherwise today's constant (DEFAULT_TIER_TUNING.tierConfidences). The
 * per-key fallback is load-bearing — stored tierTuning is a partial object
 * merged shallowly at the config boundary.
 */
const tierConfidence = (
  tier: TierConfidenceId,
  config: MatchingConfig,
): number =>
  config.tierTuning?.tierConfidences?.[tier] ??
  DEFAULT_TIER_TUNING.tierConfidences[tier];

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
  /** One exact-match index per CONFIGURED identifier role (OMN-12 identity),
   *  keyed by the canonical identifier. Empty unless
   *  matchingConfig.identifierRoles is set. */
  policyByIdentifier: Map<IdentifierRole, Map<string, CrmPolicy[]>>;
};

export type BuildMatchIndexesOptions = {
  /** Per-carrier canonicalizer (buildIdentifierCanonicalizer) applied to
   *  policy-number AND identifier index keys. Defaults to trim+uppercase
   *  (normalizePolicyNumber) — today's behavior. */
  canonicalize?: IdentifierCanonicalizer;
  /** Identifier roles to index (matchingConfig.identifierRoles). */
  identifierRoles?: IdentifierRolesConfig;
};

export const buildMatchIndexes = (
  policies: CrmPolicy[],
  options: BuildMatchIndexesOptions = {},
): MatchIndexes => {
  const canonicalize = options.canonicalize ?? normalizePolicyNumber;
  const identifierRoleEntries = configuredIdentifierRoleEntries(
    options.identifierRoles,
  );
  const policyByNumber = new Map<string, CrmPolicy[]>();
  const policyByNpn = new Map<string, CrmPolicy[]>();
  const policyByDob = new Map<string, CrmPolicy[]>();
  const policyById = new Map<string, CrmPolicy>();
  const policyByIdentifier = new Map<IdentifierRole, Map<string, CrmPolicy[]>>();

  for (const [role] of identifierRoleEntries) {
    policyByIdentifier.set(role, new Map());
  }

  for (const p of policies) {
    policyById.set(p.id, p);

    // Index keys are canonicalized (default: trim + uppercase / date-only)
    // so hand-entered CRM variants still hit exact-identifier lookups. The
    // policy snapshots themselves keep their raw values.
    const policyNumberKey = canonicalize(p.policyNumber);

    if (policyNumberKey) {
      const existing = policyByNumber.get(policyNumberKey) ?? [];

      existing.push(p);
      policyByNumber.set(policyNumberKey, existing);
    }

    for (const [role, crmField] of identifierRoleEntries) {
      const identifierKey = canonicalize(p[crmField]);

      if (identifierKey) {
        const roleIndex = policyByIdentifier.get(role) as Map<
          string,
          CrmPolicy[]
        >;
        const existing = roleIndex.get(identifierKey) ?? [];

        existing.push(p);
        roleIndex.set(identifierKey, existing);
      }
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

  return {
    policyByNumber,
    policyByNpn,
    policyByDob,
    policyById,
    policyByIdentifier,
  };
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
  // Per-carrier statusVocabulary set when threaded by the match job
  // (MatchContext.negativeTerminalStatuses); the static default keeps
  // direct callers/tests bit-for-bit (Wave-5 handoff).
  negativeTerminalStatuses: ReadonlySet<string> = NEGATIVE_TERMINAL_STATUSES,
): CrmPolicy | null => {
  if (candidates.length < 2) return null;

  const active = candidates.filter(
    (p) => !p.status || !negativeTerminalStatuses.has(p.status),
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
  // See selectByActiveStatus — per-carrier set threaded by the match job,
  // static default preserves direct-caller behavior (Wave-5 handoff).
  negativeTerminalStatuses: ReadonlySet<string> = NEGATIVE_TERMINAL_STATUSES,
): CrmPolicy | null => {
  if (candidates.length < 2) return null;

  const allTerminal = candidates.every(
    (p) => p.status !== null && negativeTerminalStatuses.has(p.status),
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

export type MatchRowOptions = {
  /** Per-carrier identifier canonicalizer (buildIdentifierCanonicalizer),
   *  applied to the BOB policy number, the identifier-role values, and
   *  override keys — MUST be the same function the index keys were built
   *  with (buildMatchIndexes options) or exact lookups go asymmetric.
   *  Defaults to trim+uppercase (today's behavior). */
  canonicalize?: IdentifierCanonicalizer;
  /** Per-carrier statusVocabulary terminal set for the narrowing chain
   *  (MatchContext.negativeTerminalStatuses). Defaults to the static
   *  NEGATIVE_TERMINAL_STATUSES (today's behavior). */
  negativeTerminalStatuses?: ReadonlySet<string>;
};

/** Outcome of the configurable narrowing chain (matchRow internal). */
type NarrowedCandidate = {
  winner: CrmPolicy;
  reason: string;
  byRecency: boolean;
};

export const matchRow = (
  input: MatchInput,
  indexes: MatchIndexes,
  overrides: Override[],
  carrierName: string,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
  options: MatchRowOptions = {},
): MatchDecision => {
  const tolerance = config.dateToleranceDays;
  const canonicalize = options.canonicalize ?? normalizePolicyNumber;
  const negativeTerminalStatuses =
    options.negativeTerminalStatuses ?? NEGATIVE_TERMINAL_STATUSES;
  // Comparison forms — index keys are canonicalized the same way (see
  // buildMatchIndexes), so exact-identifier lookups survive case/format
  // variance in hand-entered CRM data.
  const inputPolicyNumber = canonicalize(input.policyNumber);
  const inputDob = normalizeDateOnly(input.memberDob);
  const identifierRoleEntries = configuredIdentifierRoleEntries(
    config.identifierRoles,
  );

  // Configurable multi-candidate narrowing (OMN-12): the same ordered chain
  // serves the policy-number tiers and the IDENTIFIER_EXACT tier. The
  // default strategy list reproduces the previously fixed activeStatus →
  // activeTerm → mostRecentEffectiveDate cascade bit-for-bit.
  const narrowingStrategies =
    config.narrowingStrategies ?? DEFAULT_MATCHING_CONFIG.narrowingStrategies;
  const narrowCandidates = (
    candidates: CrmPolicy[],
  ): NarrowedCandidate | null => {
    if (candidates.length < 2) return null;

    for (const strategy of narrowingStrategies) {
      if (strategy === 'activeStatus') {
        const winner = selectByActiveStatus(
          candidates,
          negativeTerminalStatuses,
        );

        if (winner) return { winner, reason: 'active status', byRecency: false };
      } else if (strategy === 'activeTerm') {
        const winner = selectByActiveTerm(candidates, input.paidThroughDate);

        if (winner) {
          return {
            winner,
            reason: `paid-through ${input.paidThroughDate}`,
            byRecency: false,
          };
        }
      } else {
        const winner = selectByMostRecentEffectiveDate(
          candidates,
          negativeTerminalStatuses,
        );

        if (winner) {
          return { winner, reason: 'most recent effective date', byRecency: true };
        }
      }
    }

    return null;
  };

  // Override keys: the canonical policy number plus — for identifier-role
  // carriers only — the canonical configured identifier values, because
  // their review items stamp the identifier into carrierPolicyNumber and
  // override learning keys off that column (review-item identity contract).
  // With identifierRoles unset this set is exactly {inputPolicyNumber}.
  const overrideKeys = new Set<string>();

  if (inputPolicyNumber) overrideKeys.add(inputPolicyNumber);

  for (const [role] of identifierRoleEntries) {
    const canonicalIdentifier = canonicalize(input[role]);

    if (canonicalIdentifier) overrideKeys.add(canonicalIdentifier);
  }

  // Tier 1: Override check
  if (isTierEnabled('OVERRIDE', config) && overrideKeys.size > 0) {
    const override = overrides.find((o) => {
      if (!o.isActive) return false;
      if (o.carrierName.toLowerCase() !== carrierName.toLowerCase()) {
        return false;
      }

      const overrideKey = canonicalize(o.carrierPolicyNumber);

      return overrideKey !== null && overrideKeys.has(overrideKey);
    });

    if (override) {
      const policy = indexes.policyById.get(override.crmPolicyId);
      // With identifierRoles unset, a hit implies inputPolicyNumber matched
      // — the note text is unchanged for existing carriers. The identifier
      // fallback label only renders for identifier-keyed overrides.
      const overrideLabel =
        inputPolicyNumber ?? canonicalize(override.carrierPolicyNumber);

      return {
        crmPolicyId: override.crmPolicyId,
        crmPolicyNumber: policy?.policyNumber ?? null,
        confidence: 100,
        method: 'OVERRIDE',
        status: 'AUTO_MATCHED',
        notes: `Manual override: carrier policy ${overrideLabel} → CRM policy ${override.crmPolicyId}`,
      };
    }
  }

  // Find all policies with matching policy number
  const allPolicyNumberMatches = inputPolicyNumber
    ? (indexes.policyByNumber.get(inputPolicyNumber) ?? [])
    : [];

  // Disambiguate multi-policy-number candidates BEFORE running proximity-
  // based tiers, via the configurable narrowing chain (default order:
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
  //
  // matchingConfig.narrowingStrategies reorders/trims the chain per carrier;
  // the default list reproduces this exact cascade.)
  const narrowed =
    allPolicyNumberMatches.length > 1
      ? narrowCandidates(allPolicyNumberMatches)
      : null;
  const narrowedWinner = narrowed?.winner ?? null;
  const narrowedByRecency = narrowed?.byRecency ?? false;

  const policyNumberMatches = narrowedWinner
    ? [narrowedWinner]
    : allPolicyNumberMatches;
  const narrowSuffix = narrowed
    ? ` (disambiguated from ${allPolicyNumberMatches.length} candidates by ${narrowed.reason})`
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
        const confidence = tierConfidence('POLICY_NUMBER_DATE_AGENT', config);

        return finalizeNarrowedDecision({
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence,
          method: 'POLICY_NUMBER_DATE_AGENT',
          status: classifyConfidence(confidence, config),
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
        const confidence = tierConfidence('POLICY_NUMBER_DATE', config);

        return finalizeNarrowedDecision({
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence,
          method: 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE',
          status: classifyConfidence(confidence, config),
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
        const confidence = tierConfidence('POLICY_NUMBER_AGENT', config);

        return finalizeNarrowedDecision({
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence,
          method: 'POLICY_NUMBER_PLUS_AGENT',
          status: classifyConfidence(confidence, config),
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
      const confidence = tierConfidence('POLICY_NUMBER_SINGLE', config);

      return finalizeNarrowedDecision({
        crmPolicyId: match.id,
        crmPolicyNumber: match.policyNumber,
        confidence,
        method: 'POLICY_NUMBER_SINGLE',
        status: classifyConfidence(confidence, config),
        notes: `Single CRM policy matched by policy number "${inputPolicyNumber}"${narrowSuffix}`,
      });
    }

    // Tier 6: Multi-match disambiguation
    if (
      isTierEnabled('POLICY_NUMBER_MULTI_BEST', config) &&
      policyNumberMatches.length > 1
    ) {
      // Per-key fallback to today's constants — stored tierTuning is partial.
      const tier6Weights: Tier6Weights = {
        ...DEFAULT_TIER_TUNING.tier6Weights,
        ...config.tierTuning?.tier6Weights,
      };
      const proximityBands = [
        ...(config.tierTuning?.dateProximityBands ??
          DEFAULT_TIER_TUNING.dateProximityBands),
      ].sort((a, b) => a.maxDays - b.maxDays);
      const proximityFloor =
        config.tierTuning?.dateProximityFloor ??
        DEFAULT_TIER_TUNING.dateProximityFloor;

      const scored = policyNumberMatches.map((p) => {
        let score = 0;

        score +=
          dateProximityScore(
            p.effectiveDate,
            input.effectiveDate,
            proximityBands,
            proximityFloor,
          ) * tier6Weights.dateProximity;

        if (
          agentNameMatches(
            input.agentName,
            p['agent.name'],
            config.agentNameThreshold,
          )
        ) {
          score += tier6Weights.agentMatch;
        }

        const nameScore = memberNameScore(
          input.memberFirstName,
          input.memberLastName,
          p['lead.name.firstName'],
          p['lead.name.lastName'],
        );

        score += nameScore * tier6Weights.memberName;

        const leadDob = normalizeDateOnly(p['lead.dateOfBirth']);

        if (inputDob && leadDob && inputDob === leadDob) {
          score += tier6Weights.dobExact;
        }

        return { policy: p, score };
      });

      scored.sort((a, b) => b.score - a.score);

      const best = scored[0];
      const confidence = Math.min(
        Math.round(best.score),
        tier6Weights.confidenceCap,
      );

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

  // Tier IDENTIFIER_EXACT: exact canonical-identifier match for carriers
  // whose files key people by member/subscriber/group IDs instead of policy
  // numbers (BCBS-class; audit 2026-06-11 §"Identity is single-role and
  // policy-number-shaped"). Mirrors the policy-number tiers' shape: exact
  // index hit → narrowing chain → date corroboration → best-name heuristic.
  //
  // GATING CHOICE (bit-for-bit preservation): the tier requires
  // matchingConfig.identifierRoles to be configured, NOT merely an
  // enabledTiers entry. DEFAULT_MATCHING_CONFIG.enabledTiers spreads
  // MATCH_TIER_IDS wholesale, so every existing config (and every stored
  // config restating the default list) implicitly "enables" the new id —
  // gating on enabledTiers alone could therefore change existing carriers.
  // identifierRoles defaults to {} and no existing config sets it, so the
  // tier is provably inert until a carrier opts in; enabledTiers can then
  // still disable it like any other tier.
  if (
    identifierRoleEntries.length > 0 &&
    isTierEnabled('IDENTIFIER_EXACT', config)
  ) {
    for (const [role, crmField] of identifierRoleEntries) {
      const canonicalIdentifier = canonicalize(input[role]);

      if (!canonicalIdentifier) continue;

      const allIdentifierMatches =
        indexes.policyByIdentifier.get(role)?.get(canonicalIdentifier) ?? [];

      if (allIdentifierMatches.length === 0) continue;

      const identifierLabel = `${role} "${canonicalIdentifier}" (CRM ${crmField})`;
      const idNarrowed = narrowCandidates(allIdentifierMatches);
      const identifierCandidates = idNarrowed
        ? [idNarrowed.winner]
        : allIdentifierMatches;
      const idNarrowSuffix = idNarrowed
        ? ` (disambiguated from ${allIdentifierMatches.length} candidates by ${idNarrowed.reason})`
        : '';
      const baseConfidence = tierConfidence('IDENTIFIER_EXACT', config);

      // Recency narrowing is the same ops heuristic here as in the policy-
      // number tiers — cap below auto-match and route to review. The method
      // stays IDENTIFIER_EXACT (POLICY_NUMBER_NARROWED_RECENT would
      // misdescribe the evidence).
      const finalizeIdentifierDecision = (
        decision: MatchDecision,
      ): MatchDecision => {
        if (!idNarrowed?.byRecency) return decision;

        return {
          ...decision,
          confidence: Math.min(
            decision.confidence,
            config.autoMatchThreshold - 1,
          ),
          status: 'NEEDS_REVIEW',
          notes: `${decision.notes} — recency narrowing is heuristic; confidence capped below auto-match threshold`,
        };
      };

      // Unique hit (directly, or after narrowing) — mirrors Tier 5.
      if (identifierCandidates.length === 1) {
        const match = identifierCandidates[0];

        return finalizeIdentifierDecision({
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence: baseConfidence,
          method: 'IDENTIFIER_EXACT',
          status: classifyConfidence(baseConfidence, config),
          notes: `Exact identifier match: ${identifierLabel}${idNarrowSuffix}`,
        });
      }

      // Date corroboration — mirrors Tier 3.
      if (input.effectiveDate) {
        const dateMatches = identifierCandidates.filter((p) =>
          datesWithinDays(p.effectiveDate, input.effectiveDate, tolerance),
        );

        if (dateMatches.length === 1) {
          const match = dateMatches[0];

          return finalizeIdentifierDecision({
            crmPolicyId: match.id,
            crmPolicyNumber: match.policyNumber,
            confidence: baseConfidence,
            method: 'IDENTIFIER_EXACT',
            status: classifyConfidence(baseConfidence, config),
            notes: `Exact identifier match: ${identifierLabel}, effective dates within ${tolerance} days (BOB: ${input.effectiveDate}, CRM: ${match.effectiveDate})${idNarrowSuffix}`,
          });
        }
      }

      // Shared identifier (e.g. a subscriber id covering every dependent):
      // best member-name candidate, never auto-matched — mirrors the
      // Tier 7/8 best-of selection with deterministic tie-breaks.
      const scored = identifierCandidates
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

      if (scored.length > 0) {
        const best = scored[0];
        const confidence = Math.min(
          baseConfidence,
          config.autoMatchThreshold - 1,
        );

        return {
          crmPolicyId: best.policy.id,
          crmPolicyNumber: best.policy.policyNumber,
          confidence,
          method: 'IDENTIFIER_EXACT',
          status: 'NEEDS_REVIEW',
          notes: `Identifier ${identifierLabel} shared by ${identifierCandidates.length} CRM policies; best member-name similarity ${best.nameScore.toFixed(2)} — needs review`,
        };
      }

      // No corroborating signal singles a candidate out — try the next
      // configured role rather than guessing among shared-identifier rows.
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
      const confidence = tierConfidence('NAME_DOB_DATE', config);

      return {
        crmPolicyId: best.policy.id,
        crmPolicyNumber: best.policy.policyNumber,
        confidence,
        method: 'NAME_DOB_DATE',
        status: classifyConfidence(confidence, config),
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

  // Identifier-role carriers usually have no policy number at all — label
  // the unmatched note with the canonical primary identifier instead of
  // 'null'. With identifierRoles unset this is exactly inputPolicyNumber.
  let unmatchedLabel: string | null = inputPolicyNumber;

  if (unmatchedLabel === null) {
    for (const [role] of identifierRoleEntries) {
      unmatchedLabel = canonicalize(input[role]);
      if (unmatchedLabel !== null) break;
    }
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
        : `No CRM policy found for carrier policy "${unmatchedLabel}"`,
  };
};
