import type { CrmPolicy } from 'src/modules/reconciliation/engines/matching';
import { daysBetweenUTC } from 'src/modules/reconciliation/parsers/transforms';
import type {
  ColumnMapping,
  ComputedFieldDef,
} from 'src/modules/reconciliation/types/reconciliation';

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

export const normalizePaidThroughDateForEffectiveDate = (
  paidThroughDate: string | null,
  effectiveDate: string | null,
): string | null =>
  paidThroughDate && effectiveDate && paidThroughDate < effectiveDate
    ? null
    : paidThroughDate;

// ---------------------------------------------------------------------------
// Column-mapping-driven status input
// ---------------------------------------------------------------------------

/**
 * Build status engine input from a parsed row using statusConfig.fieldMapping.
 * The fieldMapping maps engine roles → XLSX column headers (or computed field keys).
 */
export const buildStatusInputFromMapping = (
  row: Record<string, unknown>,
  fieldMapping: Record<string, string>,
): StatusInput => {
  const effectiveDate = fieldMapping.effectiveDate
    ? ((row[fieldMapping.effectiveDate] as string) ?? null)
    : null;
  const paidThroughDate = fieldMapping.paidThroughDate
    ? ((row[fieldMapping.paidThroughDate] as string) ?? null)
    : null;

  return {
    effectiveDate,
    paidThroughDate: normalizePaidThroughDateForEffectiveDate(
      paidThroughDate,
      effectiveDate,
    ),
    termDate: fieldMapping.termDate
      ? ((row[fieldMapping.termDate] as string) ?? null)
      : null,
    eligibleForCommission: fieldMapping.eligibleForCommission
      ? ((row[fieldMapping.eligibleForCommission] as boolean) ?? null)
      : null,
  };
};

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

/**
 * Subtract `days` from a date-only string, entirely in UTC.
 *
 * `new Date('YYYY-MM-DD')` parses as UTC midnight, so the mutation must use
 * setUTCDate/getUTCDate (consistent with lastDayOfMonth below). Mixing in
 * local-time setDate/getDate made the result off by one UTC day when the
 * subtraction crossed a DST fall-back boundary in the server's timezone
 * (e.g. TZ=America/New_York: '2026-11-02' - 1 day returned '2026-10-31'
 * instead of '2026-11-01').
 */
const subtractDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);

  d.setUTCDate(d.getUTCDate() - days);

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
  const paidThrough = normalizePaidThroughDateForEffectiveDate(
    bobRow.paidThroughDate,
    effectiveDate,
  );
  const termDate = bobRow.termDate;
  const eligible = bobRow.eligibleForCommission;
  const todayStr = toDateString(today);
  const currentCrmStatus = getCurrentCrmStatus(
    allCrmPoliciesForNumber,
    currentPolicyId,
  );

  // --- CANCELED cases ---
  // Neither cancel signal requires an effective date, so both run BEFORE the
  // missing-effective-date default below. (Previously the default returned
  // ACTIVE_APPROVED first, so an explicitly-canceled row whose effective-date
  // cell was blank or unparseable derived the opposite of what it said.)
  // effectiveDate is only used to pick the expire date; when it's absent,
  // fall back through paidThrough → termDate → null.

  if (eligible === false) {
    const expireDate = effectiveDate
      ? paidThrough && paidThrough >= effectiveDate
        ? paidThrough
        : effectiveDate
      : (paidThrough ?? termDate ?? null);
    const derivedStatus = deriveCanceledStatus(currentCrmStatus);
    const reasonLabel = formatCanceledStatusReasonLabel(derivedStatus);

    return {
      derivedStatus,
      derivedExpireDate: expireDate,
      cancelPreviousPolicyId: null,
      statusChangeReason: `Not eligible for commission → ${reasonLabel} (expire: ${expireDate ?? 'unknown'})`,
    };
  }

  if (termDate && termDate < todayStr) {
    const expireDate = effectiveDate
      ? paidThrough && paidThrough >= effectiveDate
        ? paidThrough
        : termDate
      : (paidThrough ?? termDate);
    const derivedStatus = deriveCanceledStatus(currentCrmStatus);
    const reasonLabel = formatCanceledStatusReasonLabel(derivedStatus);

    return {
      derivedStatus,
      derivedExpireDate: expireDate,
      cancelPreviousPolicyId: null,
      statusChangeReason: `Term date ${termDate} is in the past → ${reasonLabel} (expire: ${expireDate})`,
    };
  }

  // --- No usable effective date (and no cancel signal): default assertion ---
  // deriveCategory (types/field-config.ts) now treats a null derivedStatus
  // as "no status assertion" (Phase 4.3), so returning null here would no
  // longer flood review with empty UPDATE items — but we keep asserting
  // ACTIVE_APPROVED deliberately: a BOB row with no cancel signal describes
  // a policy the carrier considers live, and reviewers want the status
  // engine's read (with its reason string) rather than silence.

  if (!effectiveDate) {
    return {
      derivedStatus: 'ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: null,
      statusChangeReason:
        'No effective date available, defaulting to Active-Approved',
    };
  }

  const currentMonthEnd = lastDayOfMonth(todayStr) ?? todayStr;

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
      derivedStatus: 'PAYMENT_ERROR_ACTIVE_APPROVED',
      derivedExpireDate: null,
      cancelPreviousPolicyId: cancelPrev,
      statusChangeReason: `No payment data for active effective date ${effectiveDate}; does not cover current month end ${currentMonthEnd} → Payment Error`,
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

const STATUS_ENGINES = {
  'ambetter-bob-v1': deriveAmbetterStatus,
} satisfies Record<string, StatusEngineFn>;

export type StatusEngineId = keyof typeof STATUS_ENGINES;

/**
 * Registered status-engine ids. `loadMatchContext` validates the configured
 * `statusConfig.engineId` against this list and fails the run at MATCH with
 * an actionable error instead of silently deriving null statuses (audit
 * 2026-06-10 §"Unknown parserVersion silently disables the status engine").
 */
export const STATUS_ENGINE_IDS = Object.keys(
  STATUS_ENGINES,
) as StatusEngineId[];

export const isKnownStatusEngine = (id: string): id is StatusEngineId =>
  Object.prototype.hasOwnProperty.call(STATUS_ENGINES, id);

export const deriveStatus = (
  parserId: string,
  input: StatusInput,
  allCrmPoliciesForNumber: CrmPolicy[],
  today: Date,
  config: StatusEngineConfig = DEFAULT_STATUS_ENGINE_CONFIG,
  currentPolicyId?: string | null,
): StatusDecision | null => {
  // Returns null for unknown engine ids (legacy contract — some callers
  // probe engines speculatively). The match job never relies on this:
  // loadMatchContext fail-fasts on `isKnownStatusEngine` before any row
  // reaches deriveStatus.
  if (!isKnownStatusEngine(parserId)) {
    return null;
  }

  const engine = STATUS_ENGINES[parserId];

  return engine(input, allCrmPoliciesForNumber, today, config, currentPolicyId);
};

export const getCancelExpireDate = (newEffectiveDate: string): string =>
  subtractDays(newEffectiveDate, 1);

// ---------------------------------------------------------------------------
// Jackie's broker-effective audit rule (single implementation — Phase 4.5)
// ---------------------------------------------------------------------------

export type BrokerEffAuditInput = {
  brokerEffectiveDate: string | null;
  policyEffectiveDate: string | null;
  paidThroughDate: string | null;
  eligibleForCommission: boolean | null;
  derivedStatus: string | null;
};

export type BrokerEffAuditResult = {
  flagged: boolean;
  reason: string;
};

/**
 * Jackie's rule: flag a policy for audit research when EITHER:
 *   1. it is canceled, OR
 *   2. its paid-through date lapsed more than 1 day before the broker
 *      effective date ("paid before broker effective").
 *
 * Precondition for both triggers: brokerEffectiveDate > policyEffectiveDate
 * (OMNIA came on as broker after the original enrollment — "dead before we
 * started"). Rows where broker-effective is missing or not later than
 * policy-effective never flag.
 *
 * This is THE single implementation. It previously existed twice with
 * divergent logic (deriveFlags in types/field-config.ts — the reviewed
 * version whose semantics this preserves — and an inline copy in
 * match.job.ts's unmatched branch that read the wrong column and skipped
 * the precondition; audit 2026-06-10 §"Jackie's broker-eff audit rule
 * duplicated").
 *
 * The cancel predicate accepts two signals:
 *   - derivedStatus CANCELED / PAYMENT_ERROR_CANCELED (matched rows, where
 *     the status engine ran), and
 *   - eligibleForCommission === false (unmatched rows, where it didn't).
 * For matched Ambetter rows these are equivalent — eligible=false always
 * derives a *_CANCELED status — so folding the raw signal in here changes
 * nothing for the matched path while giving unmatched rows the same rule.
 */
export const deriveBrokerEffAudit = (
  input: BrokerEffAuditInput,
): BrokerEffAuditResult => {
  const {
    brokerEffectiveDate,
    policyEffectiveDate,
    paidThroughDate,
    eligibleForCommission,
    derivedStatus,
  } = input;

  if (
    !brokerEffectiveDate ||
    !policyEffectiveDate ||
    brokerEffectiveDate <= policyEffectiveDate
  ) {
    return { flagged: false, reason: '' };
  }

  const isCanceled =
    derivedStatus === 'CANCELED' ||
    derivedStatus === 'PAYMENT_ERROR_CANCELED' ||
    eligibleForCommission === false;

  let paidBeforeBrokerEff = false;
  let daysBefore = 0;

  if (paidThroughDate) {
    daysBefore =
      (new Date(brokerEffectiveDate).getTime() -
        new Date(paidThroughDate).getTime()) /
      (1000 * 60 * 60 * 24);

    paidBeforeBrokerEff = daysBefore > 1;
  }

  // Paid-before-broker-effective takes precedence over the cancel reason —
  // mirrors the reviewed deriveFlags ternary exactly.
  if (paidBeforeBrokerEff) {
    return {
      flagged: true,
      reason: `Paid-thru ${paidThroughDate}, broker effective ${brokerEffectiveDate} (${Math.round(daysBefore)}d after lapse; policy eff ${policyEffectiveDate})`,
    };
  }

  if (isCanceled) {
    return {
      flagged: true,
      reason: `Status CANCELED, broker effective ${brokerEffectiveDate} > policy effective ${policyEffectiveDate}`,
    };
  }

  return { flagged: false, reason: '' };
};

/**
 * Extract `deriveBrokerEffAudit` inputs from a parsed BOB row via
 * statusConfig.fieldMapping (role → row key). Shared by deriveFlags and the
 * match job's unmatched branch so both feed the rule the same columns.
 */
export const buildBrokerEffAuditInput = (
  row: Record<string, unknown>,
  statusFieldMapping: Record<string, string>,
  derivedStatus: string | null,
): BrokerEffAuditInput => {
  const readString = (key: string | undefined): string | null =>
    key ? ((row[key] as string | null | undefined) ?? null) : null;

  const eligibleKey =
    statusFieldMapping.eligibleForCommission ?? 'eligibleForCommission';
  const eligibleVal = row[eligibleKey];

  return {
    brokerEffectiveDate: readString(statusFieldMapping.brokerEffectiveDate),
    policyEffectiveDate: readString(statusFieldMapping.policyEffectiveDate),
    paidThroughDate: readString(
      statusFieldMapping.paidThroughDate ?? 'paidThroughDate',
    ),
    eligibleForCommission:
      typeof eligibleVal === 'boolean' ? eligibleVal : null,
    derivedStatus,
  };
};

// ---------------------------------------------------------------------------
// Effective-date header resolution (single implementation — Phase 4.5)
// ---------------------------------------------------------------------------

/**
 * Resolve THE row key that carries a BOB row's effective date.
 *
 * The match job previously resolved "effective date" two different ways
 * (audit 2026-06-10): the start-date cutoff used the columnMapping header
 * whose crmField === 'effectiveDate', while dedup and cancel-expire stamping
 * used statusFieldMapping.effectiveDate — two different columns for Ambetter
 * (raw policy/broker column vs the computed 'True Effective Date'). All
 * phases now agree on this resolution:
 *
 *   1. The computed field mapped to crmField 'effectiveDate' (Ambetter's
 *      'True Effective Date' = maxDate(brokerEff, policyEff)) — the value
 *      the status engine and diff already consume.
 *   2. Otherwise the columnMapping header mapped to crmField 'effectiveDate'
 *      (carriers without a computed effective date).
 */
export const resolveEffectiveDateHeader = (
  columnMapping: ColumnMapping,
  computedFields: ComputedFieldDef[] | null,
): string | undefined => {
  const computed = computedFields?.find(
    (cf) => cf.crmField === 'effectiveDate',
  );

  if (computed) {
    return computed.outputKey;
  }

  return Object.entries(columnMapping).find(
    ([, entry]) => entry.crmField === 'effectiveDate',
  )?.[0];
};
