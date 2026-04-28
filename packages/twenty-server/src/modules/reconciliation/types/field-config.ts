/**
 * Unified field configuration type.
 *
 * One entry per field, stored as FieldConfigEntry[] on CarrierConfig.fieldConfig.
 * Drives all 6 pipeline stages: parse, match, status, diff, review, apply.
 */

// ---------------------------------------------------------------------------
// Vocabulary types
// ---------------------------------------------------------------------------

export type FieldDataType = 'text' | 'date' | 'boolean' | 'number' | 'currency';

export type ComputationMethod = 'maxDate' | 'minDate' | 'coalesce';

export type CompareMethod =
  | 'exact'
  | 'caseInsensitive'
  | 'fuzzyName'
  | 'dateWithin30d';

export type MatchingRole =
  | 'policyNumber'
  | 'effectiveDate'
  | 'agentName'
  | 'agentNpn'
  | 'memberFirstName'
  | 'memberLastName'
  | 'memberDob';

export type StatusRole =
  | 'effectiveDate'
  | 'paidThroughDate'
  | 'termDate'
  | 'eligibleForCommission';

// ---------------------------------------------------------------------------
// The core type — one entry per field
// ---------------------------------------------------------------------------

export type FieldConfigEntry = {
  /** Canonical field name, e.g. 'memberFirstName' */
  name: string;

  /** Human-readable label, e.g. 'First Name' */
  label: string;

  /** Value type — determines which transform function the parser applies */
  dataType: FieldDataType;

  /** XLSX column headers that map to this field (column-sourced fields) */
  columnAliases?: string[];

  /** Computation to derive this field from others (computed fields) */
  computation?: ComputationMethod;

  /** Canonical field names used as inputs for the computation */
  inputs?: string[];

  /**
   * CRM field path for comparison and apply.
   * Bare name = policy field ('effectiveDate').
   * 'lead.' prefix = lead field ('lead.name.firstName').
   * Presence means the diff is actionable (can be applied to CRM).
   */
  crmField?: string;

  /** Comparison strategy for the diff engine */
  compareMethod?: CompareMethod;

  /** Role this field plays in the matching engine */
  matchingRole?: MatchingRole;

  /** Role this field plays in the status engine */
  statusRole?: StatusRole;
};

// ---------------------------------------------------------------------------
// Review types (used by reviewItem workspace object)
// ---------------------------------------------------------------------------

export type ReviewCategory = 'UPDATE' | 'UNMATCHED';

export type ReviewFlag =
  | 'STATUS_CHANGE'
  | 'PAYMENT_ERROR'
  | 'REINSTATEMENT'
  | 'BROKER_EFF_AUDIT'
  | 'MULTI_MATCH'
  | 'NAME_MISMATCH';

export type DecisionAction =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SKIPPED'
  | 'FLAG_AUDIT';

// ---------------------------------------------------------------------------
// Derivation functions (called once by the match job)
// ---------------------------------------------------------------------------

import type { FieldDiff } from 'src/modules/reconciliation/engines/diff';

/**
 * Derive the review category. Returns null for confirmed records
 * (matched, no diffs, status agrees) — these should be skipped entirely.
 */
export const deriveCategory = (
  isUnmatched: boolean,
  fieldDiffs: FieldDiff[],
  derivedStatus: string | null,
  currentCrmStatus: string | null,
): ReviewCategory | null => {
  if (isUnmatched) return 'UNMATCHED';

  const hasDiffs = fieldDiffs.length > 0;
  const statusChanged = derivedStatus !== currentCrmStatus;

  if (hasDiffs || statusChanged) return 'UPDATE';

  // No diffs and status agrees — confirmed, skip creating record
  return null;
};

/**
 * Derive flags for a review item. Called AFTER diff enrichment so it can
 * inspect fieldDiffs for NAME_MISMATCH and STATUS_CHANGE detection.
 */
export const deriveFlags = (
  derivedStatus: string | null,
  currentCrmStatus: string | null,
  matchMethod: string,
  fieldDiffs: FieldDiff[],
  statusFieldMapping?: Record<string, string>,
  bobRow?: Record<string, unknown>,
): ReviewFlag[] => {
  const flags: ReviewFlag[] = [];

  // Status change: derived status differs from CRM
  if (derivedStatus && currentCrmStatus && derivedStatus !== currentCrmStatus) {
    flags.push('STATUS_CHANGE');
  }

  // Payment error
  if (derivedStatus?.startsWith('PAYMENT_ERROR')) {
    flags.push('PAYMENT_ERROR');
  }

  // Reinstatement: CRM says canceled, BOB says active
  if (
    currentCrmStatus === 'CANCELED' &&
    derivedStatus &&
    derivedStatus !== 'CANCELED'
  ) {
    flags.push('REINSTATEMENT');
  }

  // Jackie's rule: flag for audit when EITHER:
  //   1. Canceled, OR
  //   2. paidThroughDate > 1 day before brokerEffectiveDate
  // Only applies when brokerEffective > policyEffective (OMNIA came on
  // as broker after original enrollment — "dead before we started")
  if (bobRow && statusFieldMapping) {
    const brokerEffKey = statusFieldMapping.brokerEffectiveDate;
    const policyEffKey = statusFieldMapping.policyEffectiveDate;
    const ptKey = statusFieldMapping.paidThroughDate ?? 'paidThroughDate';

    const brokerEffVal = brokerEffKey
      ? (bobRow[brokerEffKey] as string | null)
      : null;
    const policyEffVal = policyEffKey
      ? (bobRow[policyEffKey] as string | null)
      : null;
    const ptVal = bobRow[ptKey] as string | null;

    // Precondition: broker effective exists and is later than policy effective
    if (brokerEffVal && policyEffVal && brokerEffVal > policyEffVal) {
      const isCanceled = derivedStatus === 'CANCELED';
      let paidBeforeBrokerEff = false;

      if (ptVal) {
        const daysBefore =
          (new Date(brokerEffVal).getTime() - new Date(ptVal).getTime()) /
          (1000 * 60 * 60 * 24);

        paidBeforeBrokerEff = daysBefore > 1;
      }

      if (isCanceled || paidBeforeBrokerEff) {
        flags.push('BROKER_EFF_AUDIT');
      }
    }
  }

  // Multi-match disambiguation
  if (matchMethod === 'POLICY_NUMBER_MULTI_BEST') {
    flags.push('MULTI_MATCH');
  }

  // Name mismatch: check if any name-related field diffs exist
  const hasNameDiff = fieldDiffs.some(
    (d) =>
      d.crmField?.endsWith('.firstName') ||
      d.crmField?.endsWith('.lastName') ||
      d.crmField === 'agent.name',
  );

  if (hasNameDiff) {
    flags.push('NAME_MISMATCH');
  }

  return flags;
};
