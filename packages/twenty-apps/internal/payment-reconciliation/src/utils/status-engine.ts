import type { CrmPolicy } from 'src/utils/matching-engine';

export type OmniaStatus =
  | 'ACTIVE_PLACED'
  | 'ACTIVE_APPROVED'
  | 'PAYMENT_ERROR_ACTIVE_PLACED'
  | 'PAYMENT_ERROR_ACTIVE_APPROVED'
  | 'CANCELED';

export type StatusDecision = {
  derivedStatus: OmniaStatus;
  derivedExpireDate: string | null;
  cancelPreviousPolicyId: string | null;
  statusChangeReason: string;
};

type BobRowForStatus = {
  trueEffectiveDate: string | null;
  paidThroughDate: string | null;
  termDate: string | null;
  eligibleForCommission: boolean | null;
};

type StatusEngineFn = (
  bobRow: BobRowForStatus,
  allCrmPoliciesForNumber: CrmPolicy[],
  today: Date,
) => StatusDecision;

const daysBetween = (a: string, b: string): number => {
  const dateA = new Date(a);
  const dateB = new Date(b);

  return Math.round(
    (dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24),
  );
};

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
) => {
  const effectiveDate = bobRow.trueEffectiveDate;

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
  if (!paidThrough || paidThrough < effectiveDate) {
    return {
      derivedStatus: 'ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason:
        'No payment data (or paid-through before effective date) → Active-Approved',
    };
  }

  const daysSinceEffective = daysBetween(effectiveDate, paidThrough);
  const paidThroughAge = daysBetween(paidThrough, todayStr);

  const isPlaced = daysSinceEffective >= 30;
  const hasPaymentError = paidThroughAge > 10;

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
  bobRow: BobRowForStatus,
  allCrmPoliciesForNumber: CrmPolicy[],
  today: Date,
): StatusDecision | null => {
  const engine = STATUS_ENGINES[parserId];

  if (!engine) {
    return null;
  }

  return engine(bobRow, allCrmPoliciesForNumber, today);
};

export const getCancelExpireDate = (newEffectiveDate: string): string =>
  subtractDays(newEffectiveDate, 1);
