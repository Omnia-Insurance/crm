import {
  buildReviewItemIdentity,
  type ExistingReviewItemForReconcile,
  planReviewItemReconcile,
} from 'src/modules/reconciliation/services/review-item-reconcile.util';

const POLICY_NUMBER_HEADER = 'Policy Number';
const POLICY_ID = 'crm-policy-id';
const OTHER_POLICY_ID = 'other-crm-policy-id';

const newMatchedItem = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  name: 'U123 → U123',
  category: 'UPDATE',
  decision: 'PENDING',
  policyId: POLICY_ID,
  carrierPolicyNumber: 'U123',
  carrierName: 'Ambetter',
  fieldDiffs: [{ field: 'status' }],
  bobRowSnapshot: { [POLICY_NUMBER_HEADER]: 'U123', __rowNumber: 1 },
  ...overrides,
});

const newUnmatchedItem = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  name: 'U999 → none',
  category: 'UNMATCHED',
  decision: 'PENDING',
  policyId: null,
  carrierPolicyNumber: 'U999',
  carrierName: 'Ambetter',
  bobRowSnapshot: { [POLICY_NUMBER_HEADER]: 'U999', __rowNumber: 7 },
  ...overrides,
});

const existingItem = (
  overrides: Partial<ExistingReviewItemForReconcile> = {},
): ExistingReviewItemForReconcile => ({
  id: 'existing-id',
  decision: 'PENDING',
  category: 'UPDATE',
  policyId: POLICY_ID,
  carrierPolicyNumber: 'U123',
  name: 'U123 → U123',
  bobRowSnapshot: { [POLICY_NUMBER_HEADER]: 'U123', __rowNumber: 1 },
  ...overrides,
});

describe('buildReviewItemIdentity', () => {
  it('combines carrier policy number and matched CRM policy id for UPDATE items', () => {
    expect(buildReviewItemIdentity(newMatchedItem())).toBe(
      `UPDATE:U123:${POLICY_ID}`,
    );
  });

  it('distinguishes multi-term CRM policies sharing one carrier number', () => {
    const identityForFirstTerm = buildReviewItemIdentity(newMatchedItem());
    const identityForSecondTerm = buildReviewItemIdentity(
      newMatchedItem({ policyId: OTHER_POLICY_ID }),
    );

    expect(identityForFirstTerm).not.toBe(identityForSecondTerm);
  });

  it('uses the carrier policy number alone for UNMATCHED items', () => {
    expect(buildReviewItemIdentity(newUnmatchedItem())).toBe('UNMATCHED:U999');
  });

  it('normalizes policy number case and whitespace', () => {
    expect(
      buildReviewItemIdentity(
        newUnmatchedItem({ carrierPolicyNumber: ' u999 ' }),
      ),
    ).toBe('UNMATCHED:U999');
  });

  it('falls back to the parse row number for UNMATCHED items without a policy number', () => {
    const identity = buildReviewItemIdentity(
      newUnmatchedItem({
        carrierPolicyNumber: null,
        bobRowSnapshot: { __rowNumber: 7 },
      }),
    );

    expect(identity).toBe('UNMATCHED:ROW:7');
  });

  it('falls back to the record name when neither policy number nor row number exists', () => {
    const identity = buildReviewItemIdentity(
      newUnmatchedItem({
        carrierPolicyNumber: null,
        bobRowSnapshot: null,
      }),
    );

    expect(identity).toBe('UNMATCHED:NAME:U999 → none');
  });

  it('resolves legacy items via the snapshot policy-number header', () => {
    const legacyIdentity = buildReviewItemIdentity(
      existingItem({ carrierPolicyNumber: null }),
      POLICY_NUMBER_HEADER,
    );

    expect(legacyIdentity).toBe(buildReviewItemIdentity(newMatchedItem()));
  });
});

describe('planReviewItemReconcile', () => {
  it('refreshes a pending item in place when the same identity reappears', () => {
    const pending = existingItem();
    const refreshed = newMatchedItem({ fieldDiffs: [{ field: 'premium' }] });

    const plan = planReviewItemReconcile({
      existingItems: [pending],
      newItems: [refreshed],
    });

    expect(plan.toUpdate).toEqual([{ id: pending.id, updates: refreshed }]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDeleteIds).toEqual([]);
  });

  it('preserves decided items untouched and never creates duplicates for them', () => {
    const approved = existingItem({ id: 'approved-id', decision: 'APPROVED' });

    const plan = planReviewItemReconcile({
      existingItems: [approved],
      newItems: [newMatchedItem()],
    });

    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDeleteIds).toEqual([]);
    expect(plan.preservedDecidedCount).toBe(1);
    expect(plan.skippedDecidedDuplicateCount).toBe(1);
  });

  it('deletes stale pending items but keeps stale decided ones', () => {
    const stalePending = existingItem({ id: 'stale-pending-id' });
    const staleDecided = existingItem({
      id: 'stale-decided-id',
      decision: 'SKIPPED',
      carrierPolicyNumber: 'U777',
    });

    const plan = planReviewItemReconcile({
      existingItems: [stalePending, staleDecided],
      newItems: [],
    });

    expect(plan.toDeleteIds).toEqual(['stale-pending-id']);
    expect(plan.preservedDecidedCount).toBe(1);
  });

  it('creates items for identities with no existing counterpart', () => {
    const brandNew = newMatchedItem({ policyId: OTHER_POLICY_ID });

    const plan = planReviewItemReconcile({
      existingItems: [existingItem({ decision: 'APPROVED' })],
      newItems: [brandNew],
    });

    expect(plan.toCreate).toEqual([brandNew]);
  });

  it('preserves the override-learning source: an approved UNMATCHED item survives a run where its row now matches', () => {
    // Run 1: row was UNMATCHED, the human approved it with a policyId — the
    // exact record fetchOverrides feeds back into Tier-1 OVERRIDE matching.
    const approvedOverrideSource = existingItem({
      id: 'override-source-id',
      decision: 'APPROVED',
      category: 'UNMATCHED',
      policyId: POLICY_ID,
      carrierPolicyNumber: 'U999',
    });
    // Run 2: the override kicks in, so the row arrives as a matched UPDATE.
    const nowMatched = newMatchedItem({ carrierPolicyNumber: 'U999' });

    const plan = planReviewItemReconcile({
      existingItems: [approvedOverrideSource],
      newItems: [nowMatched],
    });

    expect(plan.toDeleteIds).toEqual([]);
    expect(plan.toCreate).toEqual([nowMatched]);
    expect(plan.preservedDecidedCount).toBe(1);
  });

  it('dedupes against decided legacy items via the snapshot header', () => {
    const legacyApproved = existingItem({
      id: 'legacy-approved-id',
      decision: 'APPROVED',
      carrierPolicyNumber: null,
    });

    const plan = planReviewItemReconcile({
      existingItems: [legacyApproved],
      newItems: [newMatchedItem()],
      policyNumberHeader: POLICY_NUMBER_HEADER,
    });

    expect(plan.toCreate).toEqual([]);
    expect(plan.skippedDecidedDuplicateCount).toBe(1);
  });

  it('never double-refreshes one pending item when two new items collide on identity', () => {
    const pending = existingItem({ category: 'UNMATCHED', policyId: null });
    const firstNew = newUnmatchedItem({ carrierPolicyNumber: 'U123' });
    const secondNew = newUnmatchedItem({ carrierPolicyNumber: 'U123' });

    const plan = planReviewItemReconcile({
      existingItems: [pending],
      newItems: [firstNew, secondNew],
    });

    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toCreate).toHaveLength(1);
  });
});
