import type { ObjectRecord } from '@/object-record/types/ObjectRecord';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductMappingEntry = {
  pattern: string;
  productId: string;
  productName: string;
};

type ColumnMappingEntry = {
  crmField: string;
  fieldType: string;
  fieldKey: string;
};

type ColumnMapping = Record<string, ColumnMappingEntry>;

type ResolvedRelations = {
  product: { id: string; name: string } | null;
  carrier: { id: string; name: string } | null;
  agent: { id: string; name: string } | null;
};

type BuildInput = {
  bobSnapshot: Record<string, unknown>;
  columnMapping: ColumnMapping | null;
  resolvedRelations: ResolvedRelations;
  derivedStatus: string | null;
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

/** Invert columnMapping: group BOB snapshot keys by their CRM object type. */
const buildCrmFieldLookup = (
  columnMapping: ColumnMapping,
): Map<string, { bobKey: string; fieldType: string }> => {
  const lookup = new Map<string, { bobKey: string; fieldType: string }>();

  for (const [bobKey, entry] of Object.entries(columnMapping)) {
    if (entry.crmField) {
      lookup.set(entry.crmField, { bobKey, fieldType: entry.fieldType });
    }
  }

  return lookup;
};

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

/**
 * Derive a policy status from BOB fields. Mirrors the Ambetter status engine:
 * eligible=false → CANCELED, term past → CANCELED, otherwise compute from
 * effective↔paidThrough gap and current-month payment coverage.
 */
export const deriveStatusFromBob = (
  snapshot: Record<string, unknown>,
): string => {
  const eligible = snapshot.eligible_for_commission;
  const termDate = parseDate(snapshot.policy_term_date);
  const effectiveDate =
    parseDate(snapshot['True Effective Date']) ??
    parseDate(snapshot.policy_effective_date);
  const paidThroughDate = parseDate(snapshot.paid_through_date);
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

  // Rule 4: missing payment/status anchor → ACTIVE_APPROVED
  if (!effectiveDate || !paidThroughDate) {
    return 'ACTIVE_APPROVED';
  }

  // Rule 5: compute from gaps. Ambetter bills the month ahead, so the
  // current month is late as soon as paid-through is before this month end.
  const currentMonthEnd = lastDayOfMonth(now);
  const hasPaymentError = paidThroughDate < currentMonthEnd;

  if (paidThroughDate < effectiveDate) {
    return hasPaymentError
      ? 'PAYMENT_ERROR_ACTIVE_APPROVED'
      : 'ACTIVE_APPROVED';
  }

  const daysSinceEffective = daysBetween(effectiveDate, paidThroughDate);
  const isPlaced =
    isFullEffectiveMonthPaid(effectiveDate, paidThroughDate) ||
    daysSinceEffective >= PLACED_THRESHOLD_DAYS;

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
  resolvedRelations,
  derivedStatus,
  ltvAmountMicros,
  tempPolicyId,
  tempLeadId,
}: BuildInput): { policy: ObjectRecord; lead: ObjectRecord } => {
  const snap = bobSnapshot;
  const crmLookup = columnMapping
    ? buildCrmFieldLookup(columnMapping)
    : new Map();

  // Helper: get BOB value for a CRM field path
  const val = (crmField: string): unknown => {
    const entry = crmLookup.get(crmField);

    return entry ? (snap[entry.bobKey] ?? null) : null;
  };

  // ── Lead (person) ──

  const firstName = String(
    snap.inusred_first_name ?? snap.insured_first_name ?? '',
  );
  const lastName = String(snap.insured_last_name ?? '');
  const email = String(val('lead.emails.primaryEmail') ?? '');
  const phone = String(val('lead.phones.primaryPhoneNumber') ?? '');
  const dob = val('lead.dateOfBirth') ?? null;
  const state = String(
    val('lead.addressCustom.addressState') ?? snap.state ?? '',
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

  const policyNumber = String(val('policyNumber') ?? snap.policy_number ?? '');
  const effectiveDate =
    val('effectiveDate') ?? snap['True Effective Date'] ?? null;
  const expirationDate = val('expirationDate') ?? null;
  const paidThroughDate = val('paidThroughDate') ?? null;
  const applicantCount = Number(
    val('applicantCount') ?? snap.number_of_members ?? 0,
  );
  const premium = toCurrencyMicros(
    val('premium.amountMicros') ??
      snap.member_responsibility ??
      snap.monthly_premium_amount,
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
    status: derivedStatus ?? deriveStatusFromBob(snap),
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
