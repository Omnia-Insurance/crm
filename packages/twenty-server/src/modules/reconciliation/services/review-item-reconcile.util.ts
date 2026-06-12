// Pure planning logic for non-destructive match re-runs. Given the review
// items already persisted for a reconciliation and the freshly computed match
// output, decide which records to create, refresh in place, or delete —
// without ever touching an item a human (or learned rule) has decided on.
// Kept free of ORM imports so it is unit-testable in isolation; the
// transactional execution lives in ReviewItemService.reconcileMatchResults.

import { isNonEmptyString } from '@sniptt/guards';

// Minimal shape needed to compute a stable identity. Satisfied both by
// freshly built match records and by persisted reviewItem rows.
export type ReviewItemIdentitySource = {
  category?: string | null;
  matchMethod?: string | null;
  policyId?: string | null;
  carrierPolicyNumber?: string | null;
  name?: string | null;
  bobRowSnapshot?: Record<string, unknown> | null;
};

export type ExistingReviewItemForReconcile = ReviewItemIdentitySource & {
  id: string;
  decision: string | null;
};

export type ReviewItemReconcilePlan = {
  toCreate: Record<string, unknown>[];
  toUpdate: { id: string; updates: Record<string, unknown> }[];
  toDeleteIds: string[];
  preservedDecidedCount: number;
  skippedDecidedDuplicateCount: number;
};

const normalizePolicyNumber = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toUpperCase();

  return normalized.length > 0 ? normalized : null;
};

// Identity key choice (see audit finding "Re-running match permanently
// destroys reviewer decisions"):
// - UPDATE items: carrier policy number + matched CRM policy id. The match
//   job dedups by matched policy id, so this is unique within one run, and
//   the policy id disambiguates multi-term CRM policies that share one
//   carrier number (the diff engine's "namesakes" case). A re-match to a
//   different CRM term is intentionally a NEW identity: the new proposal is
//   created and the old pending one goes stale.
// - MISSING_FROM_BOB items (OMN-12 two-way reconciliation): the CRM policy
//   id. These items have no BOB row at all — their carrierPolicyNumber is
//   the CRM policy's own number, which can COLLIDE with a genuine UNMATCHED
//   file row carrying the same number (the undisambiguated-multi-candidate
//   case flags both the row AND its candidate policies). The policy id is
//   unique per item within a run and stable across re-runs, so decided
//   items survive exactly like UNMATCHED ones. They reuse the UNMATCHED
//   category (the reviewItem category SELECT has no MISSING_FROM_BOB
//   option), hence the matchMethod discriminator.
// - UNMATCHED items: carrier policy number alone (there is no CRM id). Rows
//   without a usable policy number fall back to the parse job's __rowNumber
//   snapshot stamp, then to the record name — both stable for a given
//   uploaded file.
// Legacy items created before the carrierPolicyNumber column existed resolve
// their number from bobRowSnapshot via the run's policy-number header
// (resolved from columnMapping by the match job, never guessed).
export const buildReviewItemIdentity = (
  item: ReviewItemIdentitySource,
  policyNumberHeader?: string | null,
): string => {
  const snapshot = item.bobRowSnapshot ?? null;
  const carrierPolicyNumber =
    normalizePolicyNumber(item.carrierPolicyNumber) ??
    (isNonEmptyString(policyNumberHeader)
      ? normalizePolicyNumber(snapshot?.[policyNumberHeader])
      : null);

  if (
    item.matchMethod === 'MISSING_FROM_BOB' &&
    isNonEmptyString(item.policyId)
  ) {
    return `MISSING_FROM_BOB:${item.policyId}`;
  }

  if (item.category === 'UNMATCHED') {
    if (carrierPolicyNumber !== null) {
      return `UNMATCHED:${carrierPolicyNumber}`;
    }

    const rowNumber = snapshot?.__rowNumber;

    if (typeof rowNumber === 'number') {
      return `UNMATCHED:ROW:${rowNumber}`;
    }

    return `UNMATCHED:NAME:${item.name ?? ''}`;
  }

  return `UPDATE:${carrierPolicyNumber ?? ''}:${item.policyId ?? ''}`;
};

export const planReviewItemReconcile = ({
  existingItems,
  newItems,
  policyNumberHeader,
}: {
  existingItems: ExistingReviewItemForReconcile[];
  newItems: Record<string, unknown>[];
  policyNumberHeader?: string | null;
}): ReviewItemReconcilePlan => {
  const decidedIdentities = new Set<string>();
  const pendingByIdentity = new Map<string, ExistingReviewItemForReconcile[]>();
  let preservedDecidedCount = 0;

  for (const existing of existingItems) {
    const identity = buildReviewItemIdentity(existing, policyNumberHeader);

    // Anything a human or learned rule already acted on (APPROVED, REJECTED,
    // SKIPPED, FLAG_AUDIT) is preserved untouched, including its
    // decidedAt/decisionSource/decisionRuleId audit trail.
    if ((existing.decision ?? 'PENDING') !== 'PENDING') {
      decidedIdentities.add(identity);
      preservedDecidedCount += 1;
      continue;
    }

    const pendingForIdentity = pendingByIdentity.get(identity) ?? [];

    pendingForIdentity.push(existing);
    pendingByIdentity.set(identity, pendingForIdentity);
  }

  const toCreate: Record<string, unknown>[] = [];
  const toUpdate: { id: string; updates: Record<string, unknown> }[] = [];
  const refreshedPendingIds = new Set<string>();
  let skippedDecidedDuplicateCount = 0;

  for (const newItem of newItems) {
    const identity = buildReviewItemIdentity(
      newItem as ReviewItemIdentitySource,
      policyNumberHeader,
    );

    if (decidedIdentities.has(identity)) {
      // A decided item already covers this row — never create a duplicate
      // (the duplicate would re-enter the review queue as PENDING and could
      // be re-applied on top of the already-applied decision).
      skippedDecidedDuplicateCount += 1;
      continue;
    }

    const pendingMatch = (pendingByIdentity.get(identity) ?? []).find(
      (candidate) => !refreshedPendingIds.has(candidate.id),
    );

    if (pendingMatch) {
      refreshedPendingIds.add(pendingMatch.id);
      toUpdate.push({ id: pendingMatch.id, updates: newItem });
    } else {
      toCreate.push(newItem);
    }
  }

  // Pending items whose identity no longer appears in the new run are stale
  // (row dropped from the BOB, matched a different term, or now confirmed).
  const toDeleteIds = existingItems
    .filter(
      (existing) =>
        (existing.decision ?? 'PENDING') === 'PENDING' &&
        !refreshedPendingIds.has(existing.id),
    )
    .map((existing) => existing.id);

  return {
    toCreate,
    toUpdate,
    toDeleteIds,
    preservedDecidedCount,
    skippedDecidedDuplicateCount,
  };
};
