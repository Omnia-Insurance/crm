import type { ObjectRecord } from '@/object-record/types/ObjectRecord';

import {
  invertColumnMapping,
  resolveBobValue,
  type ColumnMapping,
  type ComputedFieldDef,
  type CrmFieldLookup,
} from '@/reconciliation/utils/invertColumnMapping';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductMappingEntry = {
  pattern: string;
  productId: string;
  productName: string;
};

type ResolvedRelations = {
  product: { id: string; name: string } | null;
  carrier: { id: string; name: string } | null;
  agent: { id: string; name: string } | null;
};

/**
 * The subset of `carrierConfig.statusConfig` the client status fallback
 * reads (OMN-12 tuning depth — audit 2026-06-11 §"Config-driven client
 * status fallback for the create-policy flow"): the placed threshold that
 * used to be a hardcoded 30, and the status-engine role → row-key map used
 * to resolve the engine inputs (eligibleForCommission has no columnMapping
 * entry to invert — it is a status role, not a CRM field — so without this
 * the cancel signal only fires on the legacy Ambetter snapshot key).
 * Admin-editable JSON, so both fields are optional and type-guarded.
 */
export type ClientStatusConfig = {
  placedThresholdDays?: number;
  fieldMapping?: Record<string, string>;
};

type BuildInput = {
  bobSnapshot: Record<string, unknown>;
  columnMapping: ColumnMapping | null;
  /** Computed-field defs from carrierConfig.fieldConfig (outputKey → crmField) */
  computedFields?: ComputedFieldDef[] | null;
  resolvedRelations: ResolvedRelations;
  derivedStatus: string | null;
  /** carrierConfig.statusConfig (UnmatchedView already loads the record);
   *  parameterizes the status fallback. Null/absent = legacy literals. */
  statusConfig?: ClientStatusConfig | null;
  ltvAmountMicros: number | null;
  tempPolicyId: string;
  tempLeadId: string;
};

// ---------------------------------------------------------------------------
// Product resolution
// ---------------------------------------------------------------------------

export const resolveProductFromPlanName = (
  planName: string | null | undefined,
  productMapping: ProductMappingEntry[] | null | undefined,
): { id: string; name: string } | null => {
  if (!planName || !productMapping) return null;

  const lower = planName.toLowerCase();

  for (const entry of productMapping) {
    if (lower.includes(entry.pattern.toLowerCase())) {
      return { id: entry.productId, name: entry.productName };
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a dollar amount (e.g., "1234.67" or 1234.67) to amountMicros. */
const toCurrencyMicros = (
  value: unknown,
): { amountMicros: number; currencyCode: string } | null => {
  if (value === null || value === undefined || value === '') return null;

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (isNaN(num)) return null;

  return { amountMicros: Math.round(num * 1_000_000), currencyCode: 'USD' };
};

// ---------------------------------------------------------------------------
// Status derivation from BOB data (mirrors backend status engine logic)
// ---------------------------------------------------------------------------

const PLACED_THRESHOLD_DAYS = 30;

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const d = new Date(String(value));

  return isNaN(d.getTime()) ? null : d;
};

const daysBetween = (a: Date, b: Date): number =>
  Math.floor((b.getTime() - a.getTime()) / 86_400_000);

const lastDayOfMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

const isFullEffectiveMonthPaid = (
  effectiveDate: Date,
  paidThroughDate: Date,
): boolean => paidThroughDate >= lastDayOfMonth(effectiveDate);

export const normalizePaidThroughDateForEffectiveDate = (
  paidThroughDate: unknown,
  effectiveDate: unknown,
): string | null => {
  if (paidThroughDate === null || paidThroughDate === undefined) return null;
  if (paidThroughDate === '') return null;

  const paidThroughDateString = String(paidThroughDate);

  if (
    effectiveDate !== null &&
    effectiveDate !== undefined &&
    effectiveDate !== '' &&
    paidThroughDateString < String(effectiveDate)
  ) {
    return null;
  }

  return paidThroughDateString;
};

/**
 * Derive a policy status from BOB fields. Mirrors the Ambetter status engine:
 * eligible=false → CANCELED, term past → CANCELED, otherwise compute from
 * effective↔paidThrough gap and current-month payment coverage.
 *
 * Pass the inverted columnMapping `lookup` so date fields resolve through the
 * carrier's actual headers; without it the legacy Ambetter literals apply.
 *
 * `statusConfig` (OMN-12 tuning depth) parameterizes the two previously
 * hardcoded knobs without redesigning the flow:
 *   - `placedThresholdDays` replaces the hardcoded 30 (the client-side
 *     remnant of the split-brain Phase 4.3 fixed server-side);
 *   - `fieldMapping` (status-engine role → row key) resolves the engine
 *     inputs ahead of the crmField/legacy resolution, exactly like
 *     `resolveBobValue`'s computed-key precedence: a mapped role key wins
 *     only when the snapshot actually carries it, so pre-mapping snapshots
 *     fall through to the legacy literals unchanged.
 * Omitting both reproduces the previous behavior bit-for-bit.
 */
export const deriveStatusFromBob = (
  snapshot: Record<string, unknown>,
  lookup?: CrmFieldLookup,
  statusConfig?: ClientStatusConfig | null,
): string => {
  const resolve = (crmField: string, legacyKeys: string[]) =>
    resolveBobValue(snapshot, lookup ?? new Map(), crmField, legacyKeys);

  const placedThresholdDays =
    typeof statusConfig?.placedThresholdDays === 'number'
      ? statusConfig.placedThresholdDays
      : PLACED_THRESHOLD_DAYS;
  const fieldMapping = statusConfig?.fieldMapping ?? null;

  // Status-engine role resolution: the statusConfig.fieldMapping key wins
  // when the snapshot carries it (present-in-snapshot precedence, mirroring
  // resolveBobValue's computed-key rule); otherwise fall through to the
  // crmField-lookup / legacy-literal path below.
  const resolveRole = (role: string, fallback: () => unknown): unknown => {
    const mappedKey = fieldMapping?.[role];

    if (typeof mappedKey === 'string' && mappedKey in snapshot) {
      return snapshot[mappedKey] ?? null;
    }

    return fallback();
  };

  // 'Eligible for Commission' is a status-engine input role, not a CRM field,
  // so it has no columnMapping entry to invert — without a statusConfig
  // fieldMapping the parsed-row key from the legacy Ambetter export is the
  // only handle the client has on it.
  const eligible = resolveRole(
    'eligibleForCommission',
    () => snapshot.eligible_for_commission,
  );
  const termDate = parseDate(
    resolveRole('termDate', () =>
      resolve('expirationDate', ['policy_term_date']),
    ),
  );
  const effectiveDateRaw = resolveRole('effectiveDate', () =>
    resolve('effectiveDate', ['True Effective Date', 'policy_effective_date']),
  );
  const effectiveDate = parseDate(effectiveDateRaw);
  const normalizedPaidThroughDate = normalizePaidThroughDateForEffectiveDate(
    resolveRole('paidThroughDate', () =>
      resolve('paidThroughDate', ['paid_through_date']),
    ),
    effectiveDateRaw,
  );
  const paidThroughDate = parseDate(normalizedPaidThroughDate);
  const now = new Date();

  // Rule 1: not eligible → CANCELED
  if (eligible === false || eligible === 'false') {
    return 'CANCELED';
  }

  // Rule 2: term date in past → CANCELED
  if (termDate && termDate < now) {
    return 'CANCELED';
  }

  // Rule 3: effective date in future → ACTIVE_APPROVED
  if (effectiveDate && effectiveDate > now) {
    return 'ACTIVE_APPROVED';
  }

  // Rule 4: missing effective date anchor → ACTIVE_APPROVED
  if (!effectiveDate) {
    return 'ACTIVE_APPROVED';
  }

  // Rule 5: compute from gaps. Ambetter bills the month ahead, so the
  // current month is late as soon as paid-through is before this month end.
  const currentMonthEnd = lastDayOfMonth(now);

  // Missing paid-through data is not current for an active/effective policy.
  if (!paidThroughDate) {
    return 'PAYMENT_ERROR_ACTIVE_APPROVED';
  }

  const hasPaymentError = paidThroughDate < currentMonthEnd;

  if (paidThroughDate < effectiveDate) {
    return hasPaymentError
      ? 'PAYMENT_ERROR_ACTIVE_APPROVED'
      : 'ACTIVE_APPROVED';
  }

  const daysSinceEffective = daysBetween(effectiveDate, paidThroughDate);
  const isPlaced =
    isFullEffectiveMonthPaid(effectiveDate, paidThroughDate) ||
    daysSinceEffective >= placedThresholdDays;

  if (hasPaymentError && isPlaced) return 'PAYMENT_ERROR_ACTIVE_PLACED';
  if (hasPaymentError) return 'PAYMENT_ERROR_ACTIVE_APPROVED';
  if (isPlaced) return 'ACTIVE_PLACED';

  return 'ACTIVE_APPROVED';
};

// ---------------------------------------------------------------------------
// Build synthetic policy record
// ---------------------------------------------------------------------------

export const buildSyntheticPolicyRecord = ({
  bobSnapshot,
  columnMapping,
  computedFields,
  resolvedRelations,
  derivedStatus,
  statusConfig,
  ltvAmountMicros,
  tempPolicyId,
  tempLeadId,
}: BuildInput): { policy: ObjectRecord; lead: ObjectRecord } => {
  const snap = bobSnapshot;
  const crmLookup = invertColumnMapping(columnMapping, computedFields);

  // Helper: get BOB value for a CRM field path, with legacy Ambetter header
  // literals as the last resort (only when the mapping has no entry — see
  // resolveBobValue for the rationale).
  const val = (crmField: string, legacyKeys: string[] = []): unknown =>
    resolveBobValue(snap, crmLookup, crmField, legacyKeys);

  // ── Lead (person) ──

  const firstName = String(
    val('lead.name.firstName', [
      // 'inusred' is Ambetter's own header typo, preserved verbatim
      'inusred_first_name',
      'insured_first_name',
    ]) ?? '',
  );
  const lastName = String(
    val('lead.name.lastName', ['insured_last_name']) ?? '',
  );
  const email = String(
    val('lead.emails.primaryEmail', ['member_email']) ?? '',
  );
  const phone = String(
    val('lead.phones.primaryPhoneNumber', ['member_phone_number']) ?? '',
  );
  const dob = val('lead.dateOfBirth', ['member_date_of_birth']) ?? null;
  const state = String(
    val('lead.addressCustom.addressState', ['state']) ?? '',
  );

  const lead: ObjectRecord = {
    id: tempLeadId,
    __typename: 'Person',
    name: { firstName, lastName },
    emails: { primaryEmail: email, additionalEmails: null },
    phones: {
      primaryPhoneNumber: phone,
      primaryPhoneCountryCode: '',
      primaryPhoneCallingCode: '+1',
      additionalPhones: null,
    },
    dateOfBirth: dob,
    addressCustom: {
      addressStreet1: '',
      addressStreet2: '',
      addressCity: '',
      addressState: state,
      addressPostcode: '',
      addressCountry: '',
      addressLat: null,
      addressLng: null,
    },
    city: '',
  } as ObjectRecord;

  // ── Policy ──

  const policyNumber = String(val('policyNumber', ['policy_number']) ?? '');
  // effectiveDate resolves the computed output key (e.g. Ambetter's
  // 'True Effective Date') ahead of the raw mapped column when the snapshot
  // carries it — same precedence the server diff engine uses.
  const effectiveDate =
    val('effectiveDate', ['True Effective Date', 'policy_effective_date']) ??
    null;
  const expirationDate = val('expirationDate', ['policy_term_date']) ?? null;
  const paidThroughDate = normalizePaidThroughDateForEffectiveDate(
    val('paidThroughDate', ['paid_through_date']),
    effectiveDate,
  );
  const applicantCount = Number(
    val('applicantCount', ['number_of_members']) ?? 0,
  );
  const premium = toCurrencyMicros(
    val('premium.amountMicros', [
      // member_responsibility is the member's out-of-pocket (post-subsidy)
      // amount — preferred over the gross monthly premium, as before.
      'member_responsibility',
      'monthly_premium_amount',
    ]),
  );

  // Policy display name follows CRM convention: "Carrier - Product"
  const carrierName = resolvedRelations.carrier?.name ?? '';
  const productName = resolvedRelations.product?.name ?? '';
  const policyDisplayName =
    carrierName && productName
      ? `${carrierName} - ${productName}`
      : carrierName || productName || policyNumber;

  const policy: ObjectRecord = {
    id: tempPolicyId,
    __typename: 'Policy',
    name: policyDisplayName,
    policyNumber,
    effectiveDate: effectiveDate ?? null,
    expirationDate: expirationDate ?? null,
    paidThroughDate: paidThroughDate ?? null,
    applicantCount: applicantCount || null,
    premium: premium ?? { amountMicros: null, currencyCode: 'USD' },
    status: derivedStatus ?? deriveStatusFromBob(snap, crmLookup, statusConfig),
    // Relations — nested objects for display
    product: resolvedRelations.product ?? null,
    productId: resolvedRelations.product?.id ?? null,
    carrier: resolvedRelations.carrier ?? null,
    carrierId: resolvedRelations.carrier?.id ?? null,
    agent: resolvedRelations.agent ?? null,
    agentId: resolvedRelations.agent?.id ?? null,
    lead: {
      id: tempLeadId,
      name: { firstName, lastName },
      __typename: 'Person',
    },
    leadId: tempLeadId,
    // Null out fields we don't have
    submittedDate: null,
    applicationId: null,
    oldCrmPolicyId: null,
    ltv: { amountMicros: ltvAmountMicros, currencyCode: 'USD' },
  } as ObjectRecord;

  return { policy, lead };
};
