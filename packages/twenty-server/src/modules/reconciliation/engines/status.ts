import type { CrmPolicy } from 'src/modules/reconciliation/engines/matching';
import { daysBetweenUTC } from 'src/modules/reconciliation/parsers/transforms';
import type { FieldConfigEntry } from 'src/modules/reconciliation/types/field-config';

export type OmniaStatus =
  | 'ACTIVE_PLACED'
  | 'ACTIVE_APPROVED'
  | 'PAYMENT_ERROR_ACTIVE_PLACED'
  | 'PAYMENT_ERROR_ACTIVE_APPROVED'
  | 'PAYMENT_ERROR_CANCELED'
  | 'CANCELED';

/**
 * Type contract for status-engine pipeline inputs.
 *
 * The status engine receives BOB row values mapped to these role names via
 * `StatusConfig.fieldMapping` (XLSX header → role). Status roles are not
 * CRM fields — they're parser-side inputs the engine reads to derive status,
 * so they don't appear in `ColumnMapping` and aren't covered by `fieldType`.
 *
 * Used by `ReconciliationParseJob` to coerce raw cell values to the right
 * primitive shape before the engine runs. Add a new role here when extending
 * the status engine.
 */
export const STATUS_ENGINE_ROLE_TYPES: Record<string, 'date' | 'boolean'> = {
  effectiveDate: 'date',
  paidThroughDate: 'date',
  termDate: 'date',
  brokerEffectiveDate: 'date',
  policyEffectiveDate: 'date',
  eligibleForCommission: 'boolean',
};

export type StatusDecision = {
  derivedStatus: OmniaStatus;
  derivedExpireDate: string | null;
  cancelPreviousPolicyId: string | null;
  statusChangeReason: string;
};

// ---------------------------------------------------------------------------
// Role-based status input (config-driven replacement for BobRowForStatus)
// ---------------------------------------------------------------------------

export type StatusInput = {
  effectiveDate: string | null;
  paidThroughDate: string | null;
  termDate: string | null;
  eligibleForCommission: boolean | null;
};

export const buildStatusInput = (
  row: Record<string, unknown>,
  fieldConfig: FieldConfigEntry[],
): StatusInput => {
  const byRole = new Map(
    fieldConfig.filter((f) => f.statusRole).map((f) => [f.statusRole, f.name]),
  );

  return {
    effectiveDate: (row[byRole.get('effectiveDate')!] as string) ?? null,
    paidThroughDate: (row[byRole.get('paidThroughDate')!] as string) ?? null,
    termDate: (row[byRole.get('termDate')!] as string) ?? null,
    eligibleForCommission:
      (row[byRole.get('eligibleForCommission')!] as boolean) ?? null,
  };
};

// ---------------------------------------------------------------------------
// Column-mapping-driven status input (no FieldConfigEntry dependency)
// ---------------------------------------------------------------------------

/**
 * Build status engine input from a parsed row using statusConfig.fieldMapping.
 * The fieldMapping maps engine roles → XLSX column headers (or computed field keys).
 */
export const buildStatusInputFromMapping = (
  row: Record<string, unknown>,
  fieldMapping: Record<string, string>,
): StatusInput => ({
  effectiveDate: fieldMapping.effectiveDate
    ? ((row[fieldMapping.effectiveDate] as string) ?? null)
    : null,
  paidThroughDate: fieldMapping.paidThroughDate
    ? ((row[fieldMapping.paidThroughDate] as string) ?? null)
    : null,
  termDate: fieldMapping.termDate
    ? ((row[fieldMapping.termDate] as string) ?? null)
    : null,
  eligibleForCommission: fieldMapping.eligibleForCommission
    ? ((row[fieldMapping.eligibleForCommission] as boolean) ?? null)
    : null,
});

export type StatusEngineConfig = {
  /** Days since effective to consider a policy "placed". Default: 30 */
  placedThresholdDays: number;
  /** Legacy carrier-config field; Ambetter active payment error uses current-month coverage. */
  paymentErrorAgeDays: number;
};

export const DEFAULT_STATUS_ENGINE_CONFIG: StatusEngineConfig = {
  placedThresholdDays: 30,
  paymentErrorAgeDays: 10,
};

type StatusEngineFn = (
  bobRow: StatusInput,
  allCrmPoliciesForNumber: CrmPolicy[],
  today: Date,
  config: StatusEngineConfig,
  currentPolicyId?: string | null,
) => StatusDecision;

const daysBetween = daysBetweenUTC;

const toDateString = (d: Date): string => d.toISOString().split('T')[0];

const subtractDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);

  d.setDate(d.getDate() - days);

  return toDateString(d);
};

/**
 * Last day of the calendar month containing `dateStr` (UTC).
 * For 2026-02-01 → 2026-02-28; for 2026-03-15 → 2026-03-31.
 */
const lastDayOfMonth = (dateStr: string): string | null => {
  const d = new Date(dateStr);

  if (Number.isNaN(d.getTime())) return null;

  // Day 0 of next month = last day of current month.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

  return toDateString(last);
};

/**
 * Per Jackie's ACA placement rule: commissions are paid per calendar
 * month (not per day), so a policy is "placed" once the customer has
 * paid for the full effective month — even if that's < 30 days from
 * effective. Example: eff 2/1, paid through 2/28 = full February
 * paid = placed (28 days, fails the days-based threshold).
 *
 * Returns true when paidThroughDate covers at least the last day of
 * effectiveDate's calendar month.
 */
export const isFullEffectiveMonthPaid = (
  effectiveDate: string | null,
  paidThroughDate: string | null,
): boolean => {
  if (!effectiveDate || !paidThroughDate) return false;

  const eom = lastDayOfMonth(effectiveDate);

  if (!eom) return false;

  return paidThroughDate >= eom;
};

const isPaidThroughCurrentMonth = (
  paidThroughDate: string,
  todayStr: string,
): boolean => {
  const currentMonthEnd = lastDayOfMonth(todayStr);

  if (!currentMonthEnd) return false;

  return paidThroughDate >= currentMonthEnd;
};

const findPreviousVersion = (
  allCrmPoliciesForNumber: CrmPolicy[],
  newEffectiveDate: string,
  currentPolicyId?: string | null,
): string | null => {
  const candidates = allCrmPoliciesForNumber
    .filter(
      (p) =>
        p.id !== currentPolicyId &&
        p.effectiveDate &&
        p.effectiveDate < newEffectiveDate,
    )
    .sort((a, b) => b.effectiveDate!.localeCompare(a.effectiveDate!));

  return candidates.length > 0 ? candidates[0].id : null;
};

const getCurrentCrmStatus = (
  allCrmPoliciesForNumber: CrmPolicy[],
  currentPolicyId?: string | null,
): string | null => {
  if (!currentPolicyId) return null;

  return (
    allCrmPoliciesForNumber.find((policy) => policy.id === currentPolicyId)
      ?.status ?? null
  );
};

const deriveCanceledStatus = (currentCrmStatus: string | null): OmniaStatus =>
  currentCrmStatus?.startsWith('PAYMENT_ERROR')
    ? 'PAYMENT_ERROR_CANCELED'
    : 'CANCELED';

const formatCanceledStatusReasonLabel = (status: OmniaStatus): string =>
  status === 'PAYMENT_ERROR_CANCELED' ? 'Payment Error-Canceled' : 'Canceled';

const deriveAmbetterStatus: StatusEngineFn = (
  bobRow,
  allCrmPoliciesForNumber,
  today,
  config,
  currentPolicyId,
) => {
  const effectiveDate = bobRow.effectiveDate;

  if (!effectiveDate) {
    return {
      derivedStatus: 'ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: null,
      statusChangeReason:
        'No effective date available, defaulting to Active-Approved',
    };
  }

  const paidThrough = bobRow.paidThroughDate;
  const termDate = bobRow.termDate;
  const eligible = bobRow.eligibleForCommission;
  const todayStr = toDateString(today);
  const currentMonthEnd = lastDayOfMonth(todayStr) ?? todayStr;
  const currentCrmStatus = getCurrentCrmStatus(
    allCrmPoliciesForNumber,
    currentPolicyId,
  );

  // --- CANCELED cases ---

  if (eligible === false) {
    const expireDate =
      paidThrough && paidThrough >= effectiveDate ? paidThrough : effectiveDate;
    const derivedStatus = deriveCanceledStatus(currentCrmStatus);
    const reasonLabel = formatCanceledStatusReasonLabel(derivedStatus);

    return {
      derivedStatus,
      derivedExpireDate: expireDate,
      cancelPreviousPolicyId: null,
      statusChangeReason: `Not eligible for commission → ${reasonLabel} (expire: ${expireDate})`,
    };
  }

  if (termDate && termDate < todayStr) {
    const expireDate =
      paidThrough && paidThrough >= effectiveDate ? paidThrough : termDate;
    const derivedStatus = deriveCanceledStatus(currentCrmStatus);
    const reasonLabel = formatCanceledStatusReasonLabel(derivedStatus);

    return {
      derivedStatus,
      derivedExpireDate: expireDate,
      cancelPreviousPolicyId: null,
      statusChangeReason: `Term date ${termDate} is in the past → ${reasonLabel} (expire: ${expireDate})`,
    };
  }

  // --- ACTIVE cases (eligible=Yes or null, termDate future or null) ---

  const cancelPrev = findPreviousVersion(
    allCrmPoliciesForNumber,
    effectiveDate,
    currentPolicyId,
  );

  if (effectiveDate > todayStr) {
    return {
      derivedStatus: 'ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `Effective date ${effectiveDate} is in the future → Active-Approved`,
    };
  }

  // effectiveDate is in the past or today
  if (!paidThrough) {
    return {
      derivedStatus: 'ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: 'No payment data → Active-Approved',
    };
  }

  // Renewal edge case: paidThrough predates the new effective date (e.g.,
  // paid through Jan 31, renewed effective Apr 1). Ambetter invoices the month
  // ahead, so active policies need paid-through coverage through the current
  // month end with no grace buffer.
  if (paidThrough < effectiveDate) {
    if (!isPaidThroughCurrentMonth(paidThrough, todayStr)) {
      return {
        derivedStatus: 'PAYMENT_ERROR_ACTIVE_APPROVED',
        derivedExpireDate: null,
        cancelPreviousPolicyId: cancelPrev,
        statusChangeReason: `Paid-through ${paidThrough} predates effective ${effectiveDate} and does not cover current month end ${currentMonthEnd} → Payment Error`,
      };
    }

    return {
      derivedStatus: 'ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `Paid-through ${paidThrough} predates effective ${effectiveDate} but covers current month end ${currentMonthEnd} → Active-Approved`,
    };
  }

  const daysSinceEffective = daysBetween(effectiveDate, paidThrough);

  // "Placed" fires under EITHER rule:
  //   1. Calendar-month rule (Jackie): paid-through covers the full
  //      effective month — handles 28-day Februaries and other short
  //      months that don't reach the days-based threshold.
  //   2. Days-based fallback: ≥ placedThresholdDays since effective —
  //      catches non-1st-of-month effective dates (e.g. eff 1/15, paid
  //      2/14 doesn't cover any full calendar month but is 30+ days).
  const fullMonthPaid = isFullEffectiveMonthPaid(effectiveDate, paidThrough);
  const isPlaced =
    fullMonthPaid || daysSinceEffective >= config.placedThresholdDays;
  const hasPaymentError = !isPaidThroughCurrentMonth(paidThrough, todayStr);

  const placementReason = fullMonthPaid
    ? `paid through end of effective month (${paidThrough})`
    : `${daysSinceEffective} days between effective and paid-through`;

  if (isPlaced && hasPaymentError) {
    return {
      derivedStatus: 'PAYMENT_ERROR_ACTIVE_PLACED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `Placed (${placementReason}) with payment error (paid-through ${paidThrough} before current month end ${currentMonthEnd})`,
    };
  }

  if (!isPlaced && hasPaymentError) {
    return {
      derivedStatus: 'PAYMENT_ERROR_ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `Approved (${daysSinceEffective} days since effective, no full month yet) with payment error (paid-through ${paidThrough} before current month end ${currentMonthEnd})`,
    };
  }

  if (isPlaced) {
    return {
      derivedStatus: 'ACTIVE_PLACED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `Placed: ${placementReason}, payment current through ${currentMonthEnd}`,
    };
  }

  return {
    derivedStatus: 'ACTIVE_APPROVED',
    derivedExpireDate: null,
    cancelPreviousPolicyId: cancelPrev,
    statusChangeReason: `Approved: ${daysSinceEffective} days between effective and paid-through (no full month yet), payment current through ${currentMonthEnd}`,
  };
};

const STATUS_ENGINES: Record<string, StatusEngineFn> = {
  'ambetter-bob-v1': deriveAmbetterStatus,
};

export const deriveStatus = (
  parserId: string,
  input: StatusInput,
  allCrmPoliciesForNumber: CrmPolicy[],
  today: Date,
  config: StatusEngineConfig = DEFAULT_STATUS_ENGINE_CONFIG,
  currentPolicyId?: string | null,
): StatusDecision | null => {
  const engine = STATUS_ENGINES[parserId];

  if (!engine) {
    return null;
  }

  return engine(input, allCrmPoliciesForNumber, today, config, currentPolicyId);
};

export const getCancelExpireDate = (newEffectiveDate: string): string =>
  subtractDays(newEffectiveDate, 1);
