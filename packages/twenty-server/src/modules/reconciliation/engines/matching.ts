import { jaroWinkler } from 'jaro-winkler-typescript';

import type { FieldConfigEntry } from 'src/modules/reconciliation/types/field-config';

export type MatchMethod =
  | 'OVERRIDE'
  | 'POLICY_NUMBER_DATE_AGENT'
  | 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE'
  | 'POLICY_NUMBER_PLUS_AGENT'
  | 'POLICY_NUMBER_SINGLE'
  | 'POLICY_NUMBER_MULTI_BEST'
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

export const buildMatchInput = (
  row: Record<string, unknown>,
  fieldConfig: FieldConfigEntry[],
): MatchInput => {
  const byRole = new Map(
    fieldConfig
      .filter((f) => f.matchingRole)
      .map((f) => [f.matchingRole, f.name]),
  );

  return {
    policyNumber: (row[byRole.get('policyNumber')!] as string) ?? null,
    effectiveDate: (row[byRole.get('effectiveDate')!] as string) ?? null,
    paidThroughDate: (row[byRole.get('paidThroughDate')!] as string) ?? null,
    agentName: (row[byRole.get('agentName')!] as string) ?? null,
    agentNpn: (row[byRole.get('agentNpn')!] as string) ?? null,
    memberFirstName: (row[byRole.get('memberFirstName')!] as string) ?? null,
    memberLastName: (row[byRole.get('memberLastName')!] as string) ?? null,
    memberDob: (row[byRole.get('memberDob')!] as string) ?? null,
  };
};

// ---------------------------------------------------------------------------
// Column-mapping-driven match input (no FieldConfigEntry dependency)
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
  /** Days since effective to consider a policy "placed". Default: 30 */
  placedThresholdDays: number;
  /** Days past paid-through to flag payment error. Default: 10 */
  paymentErrorAgeDays: number;
  /** Exclude BOB rows with effective dates before this date. Default: '2025-07-09' */
  startDate: string;
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
  autoMatchThreshold: 85,
  autoRejectThreshold: 30,
  dateToleranceDays: 30,
  nameMatchThreshold: 0.88,
  enableMissingFromBob: false,
  agentNameThreshold: 0.85,
  tier7NameBands: { high: 0.98, medium: 0.93, low: 0.85 },
  tier7ConfidenceScores: { high: 92, medium: 88, low: 65 },
  tier7MinNameScore: 0.85,
  placedThresholdDays: 30,
  paymentErrorAgeDays: 10,
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

    if (p.policyNumber) {
      const existing = policyByNumber.get(p.policyNumber) ?? [];

      existing.push(p);
      policyByNumber.set(p.policyNumber, existing);
    }

    const agentNpn = p['agent.npn'];

    if (agentNpn) {
      const existing = policyByNpn.get(agentNpn) ?? [];

      existing.push(p);
      policyByNpn.set(agentNpn, existing);
    }

    const leadDob = p['lead.dateOfBirth'];

    if (leadDob) {
      const existing = policyByDob.get(leadDob) ?? [];

      existing.push(p);
      policyByDob.set(leadDob, existing);
    }
  }

  return { policyByNumber, policyByNpn, policyByDob, policyById };
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

export const matchRow = (
  input: MatchInput,
  indexes: MatchIndexes,
  overrides: Override[],
  carrierName: string,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): MatchDecision => {
  const tolerance = config.dateToleranceDays;

  // Tier 1: Override check
  if (isTierEnabled('OVERRIDE', config) && input.policyNumber) {
    const override = overrides.find(
      (o) =>
        o.isActive &&
        o.carrierPolicyNumber === input.policyNumber &&
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
        notes: `Manual override: carrier policy ${input.policyNumber} → CRM policy ${override.crmPolicyId}`,
      };
    }
  }

  // Find all policies with matching policy number
  const allPolicyNumberMatches = input.policyNumber
    ? (indexes.policyByNumber.get(input.policyNumber) ?? [])
    : [];

  // Term-window disambiguation: when paid-through falls inside exactly one
  // candidate's [effectiveDate, expirationDate] window, narrow to that one
  // candidate before running the proximity-based tiers.
  const termWindowWinner = selectByActiveTerm(
    allPolicyNumberMatches,
    input.paidThroughDate,
  );
  const policyNumberMatches = termWindowWinner
    ? [termWindowWinner]
    : allPolicyNumberMatches;
  const termWindowSuffix =
    termWindowWinner && allPolicyNumberMatches.length > 1
      ? ` (term-window disambiguated from ${allPolicyNumberMatches.length} candidates by paid-through ${input.paidThroughDate})`
      : '';

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

        return {
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence: 98,
          method: 'POLICY_NUMBER_DATE_AGENT',
          status: classifyConfidence(98, config),
          notes: `3-signal match: policy number + effective date (BOB: ${input.effectiveDate}, CRM: ${match.effectiveDate}) + agent "${input.agentName}"→"${match['agent.name']}"${termWindowSuffix}`,
        };
      }
    }

    // Tier 3: Policy number + effective date
    if (isTierEnabled('POLICY_NUMBER_DATE', config) && input.effectiveDate) {
      const dateMatches = policyNumberMatches.filter((p) =>
        datesWithinDays(p.effectiveDate, input.effectiveDate, tolerance),
      );

      if (dateMatches.length === 1) {
        const match = dateMatches[0];

        return {
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence: 95,
          method: 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE',
          status: classifyConfidence(95, config),
          notes: `Policy number matched, effective dates within ${tolerance} days (BOB: ${input.effectiveDate}, CRM: ${match.effectiveDate})${termWindowSuffix}`,
        };
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

        return {
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence: 85,
          method: 'POLICY_NUMBER_PLUS_AGENT',
          status: classifyConfidence(85, config),
          notes: `Policy number matched, broker "${input.agentName}" matched agent "${match['agent.name']}"${termWindowSuffix}`,
        };
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

      return {
        crmPolicyId: match.id,
        crmPolicyNumber: match.policyNumber,
        confidence: 90,
        method: 'POLICY_NUMBER_SINGLE',
        status: classifyConfidence(90, config),
        notes: `Single CRM policy matched by policy number "${input.policyNumber}"${termWindowSuffix}`,
      };
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

        const leadDob = p['lead.dateOfBirth'];

        if (input.memberDob && leadDob && input.memberDob === leadDob) {
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

    for (const p of npnMatches) {
      const nameScore = memberNameScore(
        input.memberFirstName,
        input.memberLastName,
        p['lead.name.firstName'],
        p['lead.name.lastName'],
      );

      if (nameScore >= config.tier7MinNameScore) {
        // Dynamic confidence based on name quality:
        // NPN confirms same agent, date confirms same enrollment window.
        // Name similarity is the remaining signal — high similarity means
        // this is almost certainly the same person.
        const bands = config.tier7NameBands;
        const scores = config.tier7ConfidenceScores;
        const confidence =
          nameScore >= bands.high
            ? scores.high
            : nameScore >= bands.medium
              ? scores.medium
              : scores.low;

        return {
          crmPolicyId: p.id,
          crmPolicyNumber: p.policyNumber,
          confidence,
          method: 'NPN_DATE_NAME',
          status: classifyConfidence(confidence, config),
          notes: `NPN-based match: broker NPN ${input.agentNpn}, name similarity ${nameScore.toFixed(2)}, effective date within ${tolerance} days`,
        };
      }
    }
  }

  // Tier 8: Name + DOB + effective date
  if (
    isTierEnabled('NAME_DOB_DATE', config) &&
    input.memberFirstName &&
    input.memberLastName &&
    input.memberDob &&
    input.effectiveDate
  ) {
    const dobCandidates = indexes.policyByDob.get(input.memberDob) ?? [];

    for (const p of dobCandidates) {
      const leadDob = p['lead.dateOfBirth'];

      if (leadDob && leadDob === input.memberDob) {
        const nameScore = memberNameScore(
          input.memberFirstName,
          input.memberLastName,
          p['lead.name.firstName'],
          p['lead.name.lastName'],
        );

        if (
          nameScore >= config.nameMatchThreshold &&
          datesWithinDays(p.effectiveDate, input.effectiveDate, tolerance)
        ) {
          return {
            crmPolicyId: p.id,
            crmPolicyNumber: p.policyNumber,
            confidence: 60,
            method: 'NAME_DOB_DATE',
            status: classifyConfidence(60, config),
            notes: `Identity-based match: name similarity ${nameScore.toFixed(2)}, DOB ${input.memberDob} exact match, effective date within ${tolerance} days`,
          };
        }
      }
    }
  }

  // Tier 9: Unmatched — provide candidate suggestions
  const candidates: string[] = [];

  if (policyNumberMatches.length > 0) {
    candidates.push(
      `${policyNumberMatches.length} policies share policy number "${input.policyNumber}" but could not be disambiguated`,
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
        : `No CRM policy found for carrier policy "${input.policyNumber}"`,
  };
};
