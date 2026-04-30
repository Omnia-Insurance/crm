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
  | 'paidThroughDate'
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

import {
  type FieldDiff,
  isNameLikeCrmField,
} from 'src/modules/reconciliation/engines/diff';

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
 * Per-flag explanation. Each entry maps a flag to a one-line, human-readable
 * reason — surfaced in the review UI so the user can see *why* the flag fired
 * without re-deriving the trigger from scratch.
 */
export type FlagReasons = Partial<Record<ReviewFlag, string>>;

export type DerivedFlagsResult = {
  flags: ReviewFlag[];
  reasons: FlagReasons;
};

/**
 * Derive flags for a review item, plus a per-flag reason string. Called AFTER
 * diff enrichment so it can inspect fieldDiffs for NAME_MISMATCH and
 * STATUS_CHANGE detection.
 */
export const deriveFlags = (
  derivedStatus: string | null,
  currentCrmStatus: string | null,
  matchMethod: string,
  fieldDiffs: FieldDiff[],
  statusFieldMapping?: Record<string, string>,
  bobRow?: Record<string, unknown>,
): DerivedFlagsResult => {
  const flags: ReviewFlag[] = [];
  const reasons: FlagReasons = {};

  // Status change: derived status differs from CRM
  if (derivedStatus && currentCrmStatus && derivedStatus !== currentCrmStatus) {
    flags.push('STATUS_CHANGE');
    reasons.STATUS_CHANGE = `${currentCrmStatus} → ${derivedStatus}`;
  }

  // Payment error
  if (derivedStatus?.startsWith('PAYMENT_ERROR')) {
    flags.push('PAYMENT_ERROR');
    reasons.PAYMENT_ERROR = `Status engine derived ${derivedStatus}`;
  }

  // Reinstatement: CRM says canceled, BOB says active
  if (
    currentCrmStatus === 'CANCELED' &&
    derivedStatus &&
    derivedStatus !== 'CANCELED'
  ) {
    flags.push('REINSTATEMENT');
    reasons.REINSTATEMENT = `CRM CANCELED → BOB ${derivedStatus}`;
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
      let daysBefore = 0;

      if (ptVal) {
        daysBefore =
          (new Date(brokerEffVal).getTime() - new Date(ptVal).getTime()) /
          (1000 * 60 * 60 * 24);

        paidBeforeBrokerEff = daysBefore > 1;
      }

      if (isCanceled || paidBeforeBrokerEff) {
        flags.push('BROKER_EFF_AUDIT');
        reasons.BROKER_EFF_AUDIT = paidBeforeBrokerEff
          ? `Paid-thru ${ptVal}, broker effective ${brokerEffVal} (${Math.round(daysBefore)}d after lapse; policy eff ${policyEffVal})`
          : `Status CANCELED, broker effective ${brokerEffVal} > policy effective ${policyEffVal}`;
      }
    }
  }

  // Multi-match disambiguation
  if (matchMethod === 'POLICY_NUMBER_MULTI_BEST') {
    flags.push('MULTI_MATCH');
    reasons.MULTI_MATCH =
      'Multiple CRM policies share this policy number — picked best by weighted score';
  }

  // Name mismatch: any name-related field diff present
  const nameDiffs = fieldDiffs.filter((d) => isNameLikeCrmField(d.crmField));

  if (nameDiffs.length > 0) {
    flags.push('NAME_MISMATCH');
    const first = nameDiffs[0];

    reasons.NAME_MISMATCH =
      nameDiffs.length === 1
        ? `${first.crmField}: "${first.crmValue ?? '∅'}" → "${first.bobValue ?? '∅'}"`
        : `${nameDiffs.length} name fields differ (e.g. ${first.crmField}: "${first.crmValue ?? '∅'}" → "${first.bobValue ?? '∅'}")`;
  }

  return { flags, reasons };
};
