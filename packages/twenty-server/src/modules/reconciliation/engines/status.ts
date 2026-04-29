import type { CrmPolicy } from 'src/modules/reconciliation/engines/matching';
import { daysBetweenUTC } from 'src/modules/reconciliation/parsers/transforms';
import type { FieldConfigEntry } from 'src/modules/reconciliation/types/field-config';

export type OmniaStatus =
  | 'ACTIVE_PLACED'
  | 'ACTIVE_APPROVED'
  | 'PAYMENT_ERROR_ACTIVE_PLACED'
  | 'PAYMENT_ERROR_ACTIVE_APPROVED'
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
    fieldConfig
      .filter((f) => f.statusRole)
      .map((f) => [f.statusRole, f.name]),
  );

  return {
    effectiveDate: (row[byRole.get('effectiveDate')!] as string) ?? null,
    paidThroughDate: (row[byRole.get('paidThroughDate')!] as string) ?? null,
    termDate: (row[byRole.get('termDate')!] as string) ?? null,
    eligibleForCommission: (row[byRole.get('eligibleForCommission')!] as boolean) ?? null,
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
  /** Days past paid-through to flag payment error. Default: 10 */
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
) => StatusDecision;

const daysBetween = daysBetweenUTC;

const toDateString = (d: Date): string => d.toISOString().split('T')[0];

const subtractDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);

  d.setDate(d.getDate() - days);

  return toDateString(d);
};

const findPreviousVersion = (
  allCrmPoliciesForNumber: CrmPolicy[],
  newEffectiveDate: string,
): string | null => {
  const candidates = allCrmPoliciesForNumber
    .filter(
      (p) =>
        p.effectiveDate &&
        p.effectiveDate < newEffectiveDate,
    )
    .sort((a, b) => b.effectiveDate!.localeCompare(a.effectiveDate!));

  return candidates.length > 0 ? candidates[0].id : null;
};

const deriveAmbetterStatus: StatusEngineFn = (
  bobRow,
  allCrmPoliciesForNumber,
  today,
  config,
) => {
  const effectiveDate = bobRow.effectiveDate;

  if (!effectiveDate) {
    return {
      derivedStatus: 'ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: null,
      statusChangeReason: 'No effective date available, defaulting to Active-Approved',
    };
  }

  const paidThrough = bobRow.paidThroughDate;
  const termDate = bobRow.termDate;
  const eligible = bobRow.eligibleForCommission;
  const todayStr = toDateString(today);

  // --- CANCELED cases ---

  if (eligible === false) {
    const expireDate =
      paidThrough && paidThrough >= effectiveDate
        ? paidThrough
        : effectiveDate;

    return {
      derivedStatus: 'CANCELED',
      derivedExpireDate: expireDate,
      cancelPreviousPolicyId: null,
      statusChangeReason: `Not eligible for commission → Canceled (expire: ${expireDate})`,
    };
  }

  if (termDate && termDate < todayStr) {
    const expireDate =
      paidThrough && paidThrough >= effectiveDate
        ? paidThrough
        : termDate;

    return {
      derivedStatus: 'CANCELED',
      derivedExpireDate: expireDate,
      cancelPreviousPolicyId: null,
      statusChangeReason: `Term date ${termDate} is in the past → Canceled (expire: ${expireDate})`,
    };
  }

  // --- ACTIVE cases (eligible=Yes or null, termDate future or null) ---

  const cancelPrev = findPreviousVersion(
    allCrmPoliciesForNumber,
    effectiveDate,
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
      statusChangeReason:
        'No payment data → Active-Approved',
    };
  }

  // Renewal edge case: paidThrough predates the new effective date (e.g.,
  // paid through Jan 31, renewed effective Apr 1). If paidThrough is stale,
  // the member hasn't paid on the new policy year — that's a payment error.
  if (paidThrough < effectiveDate) {
    const paidThroughAge = daysBetween(paidThrough, todayStr);

    if (paidThroughAge > config.paymentErrorAgeDays) {
      return {
        derivedStatus: 'PAYMENT_ERROR_ACTIVE_APPROVED',
        derivedExpireDate: null,
        cancelPreviousPolicyId: cancelPrev,
        statusChangeReason: `Paid-through ${paidThrough} predates effective ${effectiveDate} and is ${paidThroughAge} days stale → Payment Error`,
      };
    }

    return {
      derivedStatus: 'ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `Paid-through ${paidThrough} predates effective ${effectiveDate} but is recent → Active-Approved`,
    };
  }

  const daysSinceEffective = daysBetween(effectiveDate, paidThrough);
  const paidThroughAge = daysBetween(paidThrough, todayStr);

  const isPlaced = daysSinceEffective >= config.placedThresholdDays;
  const hasPaymentError = paidThroughAge > config.paymentErrorAgeDays;

  if (isPlaced && hasPaymentError) {
    return {
      derivedStatus: 'PAYMENT_ERROR_ACTIVE_PLACED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `Placed (${daysSinceEffective} days since effective) with payment error (paid-through ${paidThroughAge} days ago)`,
    };
  }

  if (!isPlaced && hasPaymentError) {
    return {
      derivedStatus: 'PAYMENT_ERROR_ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `Approved (${daysSinceEffective} days since effective) with payment error (paid-through ${paidThroughAge} days ago)`,
    };
  }

  if (isPlaced) {
    return {
      derivedStatus: 'ACTIVE_PLACED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `Placed: ${daysSinceEffective} days between effective and paid-through, payment current`,
    };
  }

  return {
    derivedStatus: 'ACTIVE_APPROVED',
    derivedExpireDate: null,
    cancelPreviousPolicyId: cancelPrev,
    statusChangeReason: `Approved: ${daysSinceEffective} days between effective and paid-through, payment current`,
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
): StatusDecision | null => {
  const engine = STATUS_ENGINES[parserId];

  if (!engine) {
    return null;
  }

  return engine(input, allCrmPoliciesForNumber, today, config);
};

export const getCancelExpireDate = (newEffectiveDate: string): string =>
  subtractDays(newEffectiveDate, 1);
