type MatchMethod =
  | 'OVERRIDE'
  | 'EXACT_POLICY_NUMBER'
  | 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE'
  | 'POLICY_NUMBER_PLUS_AGENT'
  | 'FUZZY_NAME_DATE'
  | 'UNMATCHED';

type MatchStatus =
  | 'AUTO_MATCHED'
  | 'NEEDS_REVIEW'
  | 'UNMATCHED';

export type MatchDecision = {
  crmPolicyMirrorId: string | null;
  confidence: number;
  method: MatchMethod;
  status: MatchStatus;
  notes: string;
};

export type BobRow = {
  carrierPolicyNumber: string | null;
  brokerName: string | null;
  trueEffectiveDate: string | null;
};

export type MirrorRecord = {
  id: string;
  policyNumber: string | null;
  agentName: string | null;
  effectiveDate: string | null;
};

export type Override = {
  carrierPolicyNumber: string;
  carrierName: string;
  crmPolicyId: string;
  isActive: boolean;
};

// Case-insensitive substring match for agent names
const agentNameMatches = (
  brokerName: string | null,
  agentName: string | null,
): boolean => {
  if (!brokerName || !agentName) {
    return false;
  }

  const broker = brokerName.toLowerCase();
  const agent = agentName.toLowerCase();

  return broker.includes(agent) || agent.includes(broker);
};

// Check if two dates are within N days of each other
const datesWithinDays = (
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

export const matchRow = (
  row: BobRow,
  mirrors: MirrorRecord[],
  overrides: Override[],
  carrierName: string,
): MatchDecision => {
  // 1. Check overrides first
  if (row.carrierPolicyNumber) {
    const override = overrides.find(
      (o) =>
        o.isActive &&
        o.carrierPolicyNumber === row.carrierPolicyNumber &&
        o.carrierName.toLowerCase() === carrierName.toLowerCase(),
    );

    if (override) {
      // Find the mirror record matching this CRM policy ID
      const mirror = mirrors.find(
        (m) => m.id === override.crmPolicyId,
      );

      return {
        crmPolicyMirrorId: mirror?.id ?? override.crmPolicyId,
        confidence: 100,
        method: 'OVERRIDE',
        status: 'AUTO_MATCHED',
        notes: `Manual override: carrier policy ${row.carrierPolicyNumber} → CRM policy ${override.crmPolicyId}`,
      };
    }
  }

  // Find all mirrors with matching policy number
  const policyNumberMatches = row.carrierPolicyNumber
    ? mirrors.filter(
        (m) =>
          m.policyNumber &&
          m.policyNumber === row.carrierPolicyNumber,
      )
    : [];

  if (policyNumberMatches.length === 0) {
    return {
      crmPolicyMirrorId: null,
      confidence: 0,
      method: 'UNMATCHED',
      status: 'UNMATCHED',
      notes: `No CRM policy found with policy number "${row.carrierPolicyNumber}"`,
    };
  }

  // 2. Exact policy number + effective date within 30 days
  if (row.trueEffectiveDate) {
    const dateMatches = policyNumberMatches.filter((m) =>
      datesWithinDays(m.effectiveDate, row.trueEffectiveDate, 30),
    );

    if (dateMatches.length === 1) {
      const match = dateMatches[0];

      return {
        crmPolicyMirrorId: match.id,
        confidence: 95,
        method: 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE',
        status: 'AUTO_MATCHED',
        notes: `Policy number matched, effective dates within 30 days (BOB: ${row.trueEffectiveDate}, CRM: ${match.effectiveDate})`,
      };
    }
  }

  // 3. Policy number + agent name
  if (row.brokerName) {
    const agentMatches = policyNumberMatches.filter((m) =>
      agentNameMatches(row.brokerName, m.agentName),
    );

    if (agentMatches.length === 1) {
      const match = agentMatches[0];

      return {
        crmPolicyMirrorId: match.id,
        confidence: 85,
        method: 'POLICY_NUMBER_PLUS_AGENT',
        status: 'AUTO_MATCHED',
        notes: `Policy number matched, broker "${row.brokerName}" matched agent "${match.agentName}"`,
      };
    }
  }

  // 4. Single policy number match
  if (policyNumberMatches.length === 1) {
    const match = policyNumberMatches[0];

    return {
      crmPolicyMirrorId: match.id,
      confidence: 70,
      method: 'EXACT_POLICY_NUMBER',
      status: 'AUTO_MATCHED',
      notes: `Single CRM policy matched by policy number "${row.carrierPolicyNumber}"`,
    };
  }

  // 5. Multiple matches — pick closest effective date if available, else flag for review
  if (row.trueEffectiveDate && policyNumberMatches.length > 1) {
    const sorted = policyNumberMatches
      .filter((m) => m.effectiveDate)
      .sort((a, b) => {
        const diffA = Math.abs(
          new Date(a.effectiveDate!).getTime() -
            new Date(row.trueEffectiveDate!).getTime(),
        );
        const diffB = Math.abs(
          new Date(b.effectiveDate!).getTime() -
            new Date(row.trueEffectiveDate!).getTime(),
        );

        return diffA - diffB;
      });

    if (sorted.length > 0) {
      const best = sorted[0];

      return {
        crmPolicyMirrorId: best.id,
        confidence: 50,
        method: 'FUZZY_NAME_DATE',
        status: 'NEEDS_REVIEW',
        notes: `Multiple CRM policies matched (${policyNumberMatches.length}). Best by effective date proximity: ${best.effectiveDate}`,
      };
    }
  }

  // 6. Multiple matches, no way to disambiguate
  return {
    crmPolicyMirrorId: policyNumberMatches[0].id,
    confidence: 50,
    method: 'FUZZY_NAME_DATE',
    status: 'NEEDS_REVIEW',
    notes: `Multiple CRM policies (${policyNumberMatches.length}) matched policy number "${row.carrierPolicyNumber}". Manual review required.`,
  };
};
