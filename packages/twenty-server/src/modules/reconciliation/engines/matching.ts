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

/** @deprecated Use MatchInput + buildMatchInput instead */
export type BobRow = {
  carrierPolicyNumber: string | null;
  brokerName: string | null;
  brokerNpn: string | null;
  trueEffectiveDate: string | null;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberDob: string | null;
};

// ---------------------------------------------------------------------------
// Role-based match input (config-driven replacement for BobRow)
// ---------------------------------------------------------------------------

export type MatchInput = {
  policyNumber: string | null;
  effectiveDate: string | null;
  agentName: string | null;
  agentNpn: string | null;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberDob: string | null;
};

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

/** CRM field path → matching role. Universal pipeline logic: if you map a
 *  column to policyNumber CRM field, it's used for policy number matching. */
const CRM_TO_MATCH_ROLE: Record<string, keyof MatchInput> = {
  'policyNumber': 'policyNumber',
  'effectiveDate': 'effectiveDate',
  'lead.name.firstName': 'memberFirstName',
  'lead.name.lastName': 'memberLastName',
  'lead.dateOfBirth': 'memberDob',
  'agent.name': 'agentName',
  'agent.npn': 'agentNpn',
  // Also accept dot-path sub-fields (e.g. name.firstName on person)
  'name.firstName': 'memberFirstName',
  'name.lastName': 'memberLastName',
  'dateOfBirth': 'memberDob',
};

export const buildMatchInputFromMapping = (
  row: Record<string, unknown>,
  columnMapping: ColumnMapping,
  computedFieldCrmFields?: Record<string, string>,
): MatchInput => {
  const result: MatchInput = {
    policyNumber: null,
    effectiveDate: null,
    agentName: null,
    agentNpn: null,
    memberFirstName: null,
    memberLastName: null,
    memberDob: null,
  };

  // Map from column mapping entries (XLSX header → CRM field → matching role)
  for (const [xlsxHeader, entry] of Object.entries(columnMapping)) {
    const role = CRM_TO_MATCH_ROLE[entry.crmField];

    if (role) {
      result[role] = (row[xlsxHeader] as string) ?? null;
    }
  }

  // Map from computed fields (output key → CRM field → matching role)
  if (computedFieldCrmFields) {
    for (const [outputKey, crmField] of Object.entries(computedFieldCrmFields)) {
      const role = CRM_TO_MATCH_ROLE[crmField];

      if (role && result[role] === null) {
        result[role] = (row[outputKey] as string) ?? null;
      }
    }
  }

  return result;
};

/** Normalize BobRow or MatchInput to MatchInput */
const toMatchInput = (row: BobRow | MatchInput): MatchInput => {
  if ('policyNumber' in row) return row as MatchInput;

  return {
    policyNumber: (row as BobRow).carrierPolicyNumber,
    effectiveDate: (row as BobRow).trueEffectiveDate,
    agentName: (row as BobRow).brokerName,
    agentNpn: (row as BobRow).brokerNpn,
    memberFirstName: (row as BobRow).memberFirstName,
    memberLastName: (row as BobRow).memberLastName,
    memberDob: (row as BobRow).memberDob,
  };
};

export type CrmPolicy = {
  id: string;
  policyNumber: string | null;
  applicationId: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  status: string | null;
  applicantCount: number | null;
  leadFirstName: string | null;
  leadLastName: string | null;
  leadDob: string | null;
  leadState: string | null;
  agentName: string | null;
  agentNpn: string | null;
  planIdentifier: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  leadId: string | null;
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
  name.toLowerCase().replace(COMPANY_SUFFIXES, '').replace(PUNCTUATION_RE, '').trim();

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
  const lastScore = jaroWinkler(
    bobLast.toLowerCase(),
    crmLast.toLowerCase(),
  );

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

    if (p.agentNpn) {
      const existing = policyByNpn.get(p.agentNpn) ?? [];

      existing.push(p);
      policyByNpn.set(p.agentNpn, existing);
    }

    if (p.leadDob) {
      const existing = policyByDob.get(p.leadDob) ?? [];

      existing.push(p);
      policyByDob.set(p.leadDob, existing);
    }
  }

  return { policyByNumber, policyByNpn, policyByDob, policyById };
};

export const matchRow = (
  row: BobRow | MatchInput,
  indexes: MatchIndexes,
  overrides: Override[],
  carrierName: string,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): MatchDecision => {
  const input = toMatchInput(row);
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
  const policyNumberMatches = input.policyNumber
    ? indexes.policyByNumber.get(input.policyNumber) ?? []
    : [];

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
          agentNameMatches(input.agentName, p.agentName, config.agentNameThreshold),
      );

      if (tripleMatches.length === 1) {
        const match = tripleMatches[0];

        return {
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence: 98,
          method: 'POLICY_NUMBER_DATE_AGENT',
          status: classifyConfidence(98, config),
          notes: `3-signal match: policy number + effective date (BOB: ${input.effectiveDate}, CRM: ${match.effectiveDate}) + agent "${input.agentName}"→"${match.agentName}"`,
        };
      }
    }

    // Tier 3: Policy number + effective date
    if (
      isTierEnabled('POLICY_NUMBER_DATE', config) &&
      input.effectiveDate
    ) {
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
          notes: `Policy number matched, effective dates within ${tolerance} days (BOB: ${input.effectiveDate}, CRM: ${match.effectiveDate})`,
        };
      }
    }

    // Tier 4: Policy number + agent name (fuzzy)
    if (isTierEnabled('POLICY_NUMBER_AGENT', config) && input.agentName) {
      const agentMatches = policyNumberMatches.filter((p) =>
        agentNameMatches(input.agentName, p.agentName, config.agentNameThreshold),
      );

      if (agentMatches.length === 1) {
        const match = agentMatches[0];

        return {
          crmPolicyId: match.id,
          crmPolicyNumber: match.policyNumber,
          confidence: 85,
          method: 'POLICY_NUMBER_PLUS_AGENT',
          status: classifyConfidence(85, config),
          notes: `Policy number matched, broker "${input.agentName}" matched agent "${match.agentName}"`,
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
        notes: `Single CRM policy matched by policy number "${input.policyNumber}"`,
      };
    }

    // Tier 6: Multi-match disambiguation
    if (
      isTierEnabled('POLICY_NUMBER_MULTI_BEST', config) &&
      policyNumberMatches.length > 1
    ) {
      const scored = policyNumberMatches.map((p) => {
        let score = 0;

        score +=
          dateProximityScore(p.effectiveDate, input.effectiveDate) * 40;

        if (agentNameMatches(input.agentName, p.agentName, config.agentNameThreshold)) {
          score += 30;
        }

        const nameScore = memberNameScore(
          input.memberFirstName,
          input.memberLastName,
          p.leadFirstName,
          p.leadLastName,
        );

        score += nameScore * 20;

        if (
          input.memberDob &&
          p.leadDob &&
          input.memberDob === p.leadDob
        ) {
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
    const npnMatches = npnCandidates.filter(
      (p) =>
        datesWithinDays(p.effectiveDate, input.effectiveDate, tolerance),
    );

    for (const p of npnMatches) {
      const nameScore = memberNameScore(
        input.memberFirstName,
        input.memberLastName,
        p.leadFirstName,
        p.leadLastName,
      );

      if (nameScore >= config.tier7MinNameScore) {
        // Dynamic confidence based on name quality:
        // NPN confirms same agent, date confirms same enrollment window.
        // Name similarity is the remaining signal — high similarity means
        // this is almost certainly the same person.
        const bands = config.tier7NameBands;
        const scores = config.tier7ConfidenceScores;
        const confidence =
          nameScore >= bands.high ? scores.high : nameScore >= bands.medium ? scores.medium : scores.low;

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
      if (p.leadDob && p.leadDob === input.memberDob) {
        const nameScore = memberNameScore(
          input.memberFirstName,
          input.memberLastName,
          p.leadFirstName,
          p.leadLastName,
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
    notes: candidates.length > 0
      ? `Unmatched. ${candidates.join('. ')}`
      : `No CRM policy found for carrier policy "${input.policyNumber}"`,
  };
};
