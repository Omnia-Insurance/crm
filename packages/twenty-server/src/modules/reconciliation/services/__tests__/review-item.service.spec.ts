import { RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS } from 'twenty-shared/constants';
import { In, IsNull } from 'typeorm';

import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  ReconciliationDecisionRuleService,
  type ReconciliationDecisionRuleRecord,
  RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS,
} from 'src/modules/reconciliation/services/decision-rule.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';
import { TransitionConflictError } from 'src/modules/reconciliation/services/state-machine.service';

const WORKSPACE_ID = 'workspace-id';
const RECONCILIATION_ID = 'reconciliation-id';
const REVIEW_ITEM_ID = 'review-item-id';
const MATCHED_POLICY_ID = 'matched-policy-id';
const PREVIOUS_POLICY_ID = 'previous-policy-id';
const LEAD_ID = 'lead-id';
const OTHER_LEAD_ID = 'other-lead-id';
const CARRIER_ID = 'carrier-id';
const USER_WORKSPACE_ID = 'user-workspace-id';
const WORKSPACE_MEMBER_ID = 'workspace-member-id';
const CANCEL_EXPIRE_DATE = '2026-05-31';

type WorkspaceRecord = Record<string, unknown> & { id: string };

const createReviewItem = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: REVIEW_ITEM_ID,
  reconciliationId: RECONCILIATION_ID,
  decision: 'PENDING',
  decidedAt: null,
  category: 'MATCHED',
  matchMethod: 'POLICY_NUMBER',
  confidence: 1,
  policyId: MATCHED_POLICY_ID,
  fieldDiffs: [],
  flags: [],
  bobRowSnapshot: null,
  ...overrides,
});

type DecisionRuleRecord = ReconciliationDecisionRuleRecord &
  Record<string, unknown>;

const matchesWhere = (
  record: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean =>
  Object.entries(where).every(([key, value]) => record[key] === value);

const createService = ({
  reviewItems,
  matchedPolicy,
  policiesById = {},
  decisionRules = [],
  assertUserMayWritePolicy = jest.fn().mockResolvedValue(undefined),
}: {
  reviewItems: Record<string, unknown>[];
  matchedPolicy: WorkspaceRecord | null;
  policiesById?: Record<string, WorkspaceRecord>;
  decisionRules?: DecisionRuleRecord[];
  assertUserMayWritePolicy?: jest.Mock;
}) => {
  // The `reviewItems` array acts as the backing store: `find` returns
  // shallow clones (like a real query would return fresh entities) and
  // `update` writes back to the store, so multi-step flows (APPLY then UNDO,
  // auto-apply then undo then re-run) observe their own earlier writes while
  // the service's in-flight objects stay decoupled — exactly the production
  // semantics the undo bookkeeping relies on.
  const reviewItemRepo = {
    find: jest.fn(async () => reviewItems.map((item) => ({ ...item }))),
    count: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      reviewItems.filter((item) => matchesWhere(item, where)).length,
    ),
    update: jest.fn(async (id: string, updates: Record<string, unknown>) => {
      const item = reviewItems.find((candidate) => candidate.id === id);

      if (item) Object.assign(item, updates);
    }),
    save: jest.fn(),
    delete: jest.fn(),
  };
  // Combined policy store: the matched policy plus any cancel targets, all
  // resolvable through the single prefetch IN-query (2.6).
  const policiesLookup: Record<string, WorkspaceRecord> = { ...policiesById };

  if (matchedPolicy) {
    policiesLookup[matchedPolicy.id] = matchedPolicy;
  }

  const policyQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(matchedPolicy),
  };
  const policyRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(policyQueryBuilder),
    // Prefetch IN-query: `where.id` is a typeorm In() FindOperator whose
    // `.value` is the id array.
    find: jest.fn(
      async ({ where }: { where: { id: { value: string[] } } }) =>
        where.id.value
          .map((id) => policiesLookup[id])
          .filter((policy): policy is WorkspaceRecord => policy !== undefined),
    ),
    findOne: jest.fn(
      async ({ where }: { where: { id: string } }) =>
        policiesLookup[where.id] ?? null,
    ),
    update: jest.fn(async (id: string, updates: Record<string, unknown>) => {
      const policy = policiesLookup[id];

      if (policy) Object.assign(policy, updates);
    }),
  };
  const personRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const reconciliationRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: RECONCILIATION_ID,
      columnMapping: null,
    }),
  };
  const decisionRuleRepo = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      decisionRules.filter((rule) => matchesWhere(rule, where)),
    ),
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        decisionRules.find((rule) => matchesWhere(rule, where)) ?? null,
    ),
    update: jest.fn(async (id: string, updates: Record<string, unknown>) => {
      const rule = decisionRules.find((candidate) => candidate.id === id);

      if (rule) Object.assign(rule, updates);
    }),
    save: jest.fn(async (rule: Record<string, unknown>) => ({
      id: 'new-rule-id',
      ...rule,
    })),
  };
  const reposByObjectName: Record<string, unknown> = {
    reviewItem: reviewItemRepo,
    policy: policyRepo,
    person: personRepo,
    reconciliation: reconciliationRepo,
    reconciliationDecisionRule: decisionRuleRepo,
  };
  const transaction = jest.fn(
    async (callback: (manager: unknown) => Promise<unknown>) => callback({}),
  );
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn(
      async (_workspaceId: string, objectName: string) =>
        reposByObjectName[objectName],
    ),
    getGlobalWorkspaceDataSource: jest.fn(async () => ({ transaction })),
  };
  const policyWriteAuthorizationService = {
    assertUserMayWritePolicy,
  };
  const stateMachine = {
    transition: jest.fn().mockResolvedValue(undefined),
    setFailed: jest.fn(),
  };
  // The real rule service wired to the same ORM mocks: signature building,
  // cancel detection, and rule deactivation behave exactly as in production.
  const decisionRuleService = new ReconciliationDecisionRuleService(
    globalWorkspaceOrmManager as never,
  );

  const service = new ReviewItemService(
    globalWorkspaceOrmManager as never,
    decisionRuleService as never,
    policyWriteAuthorizationService as never,
    stateMachine as never,
  );

  return {
    service,
    decisionRuleService,
    reviewItemRepo,
    policyRepo,
    personRepo,
    decisionRuleRepo,
    assertUserMayWritePolicy,
    stateMachine,
    transaction,
  };
};

const batchApplyOne = (
  service: ReviewItemService,
  options: Record<string, unknown> = {},
) =>
  service.batchApply(
    WORKSPACE_ID,
    RECONCILIATION_ID,
    'APPLY',
    { reviewItemIds: [REVIEW_ITEM_ID] },
    { learnRules: false, ...options },
  );

describe('ReviewItemService', () => {
  describe('previous policy cancel validation', () => {
    const cancelSnapshot = {
      __cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
      __cancelExpireDate: CANCEL_EXPIRE_DATE,
    };

    it('cancels the previous policy when it belongs to the same lead', async () => {
      const { service, policyRepo } = createService({
        reviewItems: [createReviewItem({ bobRowSnapshot: cancelSnapshot })],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        policiesById: {
          [PREVIOUS_POLICY_ID]: { id: PREVIOUS_POLICY_ID, leadId: LEAD_ID },
        },
      });

      const result = await batchApplyOne(service);

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(policyRepo.update).toHaveBeenCalledWith(
        PREVIOUS_POLICY_ID,
        {
          status: 'CANCELED',
          expirationDate: CANCEL_EXPIRE_DATE,
        },
        expect.anything(),
      );
    });

    it('skips the cancel when the target belongs to another lead', async () => {
      const { service, policyRepo } = createService({
        reviewItems: [createReviewItem({ bobRowSnapshot: cancelSnapshot })],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        policiesById: {
          [PREVIOUS_POLICY_ID]: {
            id: PREVIOUS_POLICY_ID,
            leadId: OTHER_LEAD_ID,
          },
        },
      });

      const result = await batchApplyOne(service);

      // The item itself still applies; only the snapshot-supplied cancel is dropped
      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(policyRepo.update).not.toHaveBeenCalled();
    });

    it('skips the cancel when the snapshot targets the matched policy itself', async () => {
      const { service, policyRepo } = createService({
        reviewItems: [
          createReviewItem({
            bobRowSnapshot: {
              __cancelPreviousPolicyId: MATCHED_POLICY_ID,
              __cancelExpireDate: CANCEL_EXPIRE_DATE,
            },
          }),
        ],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
      });

      const result = await batchApplyOne(service);

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(policyRepo.findOne).not.toHaveBeenCalled();
      expect(policyRepo.update).not.toHaveBeenCalled();
    });

    it('falls back to carrier + normalized policy number when leadId is missing', async () => {
      const { service, policyRepo } = createService({
        reviewItems: [createReviewItem({ bobRowSnapshot: cancelSnapshot })],
        matchedPolicy: {
          id: MATCHED_POLICY_ID,
          leadId: LEAD_ID,
          carrierId: CARRIER_ID,
          policyNumber: 'pol-123 ',
        },
        policiesById: {
          [PREVIOUS_POLICY_ID]: {
            id: PREVIOUS_POLICY_ID,
            leadId: null,
            carrierId: CARRIER_ID,
            policyNumber: 'POL-123',
          },
        },
      });

      const result = await batchApplyOne(service);

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(policyRepo.update).toHaveBeenCalledWith(
        PREVIOUS_POLICY_ID,
        {
          status: 'CANCELED',
          expirationDate: CANCEL_EXPIRE_DATE,
        },
        expect.anything(),
      );
    });

    it('skips the cancel when leadId is missing and the carrier differs', async () => {
      const { service, policyRepo } = createService({
        reviewItems: [createReviewItem({ bobRowSnapshot: cancelSnapshot })],
        matchedPolicy: {
          id: MATCHED_POLICY_ID,
          leadId: LEAD_ID,
          carrierId: CARRIER_ID,
          policyNumber: 'POL-123',
        },
        policiesById: {
          [PREVIOUS_POLICY_ID]: {
            id: PREVIOUS_POLICY_ID,
            leadId: null,
            carrierId: 'other-carrier-id',
            policyNumber: 'POL-123',
          },
        },
      });

      const result = await batchApplyOne(service);

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(policyRepo.update).not.toHaveBeenCalled();
    });

    it('prefers the first-class cancelPreviousPolicyId column over the snapshot', async () => {
      const { service, policyRepo } = createService({
        reviewItems: [
          createReviewItem({
            cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
            bobRowSnapshot: {
              // A diverging legacy stamp must lose to the typed column
              __cancelPreviousPolicyId: 'stale-snapshot-policy-id',
              __cancelExpireDate: CANCEL_EXPIRE_DATE,
            },
          }),
        ],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        policiesById: {
          [PREVIOUS_POLICY_ID]: { id: PREVIOUS_POLICY_ID, leadId: LEAD_ID },
        },
      });

      const result = await batchApplyOne(service);

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(policyRepo.update).toHaveBeenCalledWith(
        PREVIOUS_POLICY_ID,
        {
          status: 'CANCELED',
          expirationDate: CANCEL_EXPIRE_DATE,
        },
        expect.anything(),
      );
    });
  });

  describe('undoable cancels (1.4)', () => {
    const PRIOR_STATUS = 'ACTIVE_PLACED';
    const PRIOR_EXPIRATION_DATE = '2026-12-31';

    const undoOne = (service: ReviewItemService) =>
      service.batchApply(WORKSPACE_ID, RECONCILIATION_ID, 'UNDO', {
        reviewItemIds: [REVIEW_ITEM_ID],
      });

    it('APPLY captures the cancel target prior state before cancelling, UNDO restores it exactly', async () => {
      const previousPolicy: WorkspaceRecord = {
        id: PREVIOUS_POLICY_ID,
        leadId: LEAD_ID,
        status: PRIOR_STATUS,
        expirationDate: PRIOR_EXPIRATION_DATE,
      };
      const item = createReviewItem({
        cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
        bobRowSnapshot: { __cancelExpireDate: CANCEL_EXPIRE_DATE },
      });
      const { service, reviewItemRepo, policyRepo } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        policiesById: { [PREVIOUS_POLICY_ID]: previousPolicy },
      });

      await batchApplyOne(service);

      // The prior state lands on the review item BEFORE the cancel write,
      // so a mid-flight failure can never strand an unrecoverable cancel.
      const captureCall = reviewItemRepo.update.mock.calls.find(
        ([, updates]) =>
          (updates as Record<string, unknown>).cancelPriorStatus !== undefined,
      );
      const cancelCall = policyRepo.update.mock.calls.find(
        ([id]) => id === PREVIOUS_POLICY_ID,
      );

      expect(captureCall?.[1]).toEqual({
        cancelPriorStatus: PRIOR_STATUS,
        cancelPriorExpirationDate: PRIOR_EXPIRATION_DATE,
      });
      expect(
        reviewItemRepo.update.mock.invocationCallOrder[
          reviewItemRepo.update.mock.calls.indexOf(captureCall!)
        ],
      ).toBeLessThan(
        policyRepo.update.mock.invocationCallOrder[
          policyRepo.update.mock.calls.indexOf(cancelCall!)
        ],
      );
      expect(previousPolicy.status).toBe('CANCELED');
      expect(previousPolicy.expirationDate).toBe(CANCEL_EXPIRE_DATE);
      expect(item.decision).toBe('APPROVED');
      expect(item.cancelPriorStatus).toBe(PRIOR_STATUS);
      expect(item.cancelPriorExpirationDate).toBe(PRIOR_EXPIRATION_DATE);

      await undoOne(service);

      // Round trip: the previous policy is back to its exact prior state
      // and the capture columns are cleared.
      expect(previousPolicy.status).toBe(PRIOR_STATUS);
      expect(previousPolicy.expirationDate).toBe(PRIOR_EXPIRATION_DATE);
      expect(item.decision).toBe('PENDING');
      expect(item.cancelPriorStatus).toBeNull();
      expect(item.cancelPriorExpirationDate).toBeNull();
    });

    it('round-trips legacy items that only carry the snapshot cancel stamp', async () => {
      const previousPolicy: WorkspaceRecord = {
        id: PREVIOUS_POLICY_ID,
        leadId: LEAD_ID,
        status: PRIOR_STATUS,
        expirationDate: PRIOR_EXPIRATION_DATE,
      };
      const item = createReviewItem({
        bobRowSnapshot: {
          __cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
          __cancelExpireDate: CANCEL_EXPIRE_DATE,
        },
      });
      const { service } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        policiesById: { [PREVIOUS_POLICY_ID]: previousPolicy },
      });

      await batchApplyOne(service);

      expect(previousPolicy.status).toBe('CANCELED');
      expect(item.cancelPriorStatus).toBe(PRIOR_STATUS);

      await undoOne(service);

      expect(previousPolicy.status).toBe(PRIOR_STATUS);
      expect(previousPolicy.expirationDate).toBe(PRIOR_EXPIRATION_DATE);
      expect(item.cancelPriorStatus).toBeNull();
      expect(item.cancelPriorExpirationDate).toBeNull();
    });

    it('UNDO without a captured prior state never touches the cancel target', async () => {
      const previousPolicy: WorkspaceRecord = {
        id: PREVIOUS_POLICY_ID,
        leadId: LEAD_ID,
        status: 'CANCELED',
        expirationDate: CANCEL_EXPIRE_DATE,
      };
      const item = createReviewItem({
        decision: 'APPROVED',
        cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
        cancelPriorStatus: null,
        cancelPriorExpirationDate: null,
      });
      const { service, policyRepo } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        policiesById: { [PREVIOUS_POLICY_ID]: previousPolicy },
      });

      await undoOne(service);

      expect(item.decision).toBe('PENDING');
      expect(policyRepo.update).not.toHaveBeenCalled();
    });

    it('keeps the captured prior state when the cancel target cannot be resolved on UNDO', async () => {
      const item = createReviewItem({
        decision: 'APPROVED',
        cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
        cancelPriorStatus: PRIOR_STATUS,
        cancelPriorExpirationDate: PRIOR_EXPIRATION_DATE,
      });
      const { service, policyRepo } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        // Cancel target no longer exists
        policiesById: {},
      });

      await undoOne(service);

      expect(item.decision).toBe('PENDING');
      expect(policyRepo.update).not.toHaveBeenCalled();
      // The capture survives so a later retry can still restore it
      expect(item.cancelPriorStatus).toBe(PRIOR_STATUS);
      expect(item.cancelPriorExpirationDate).toBe(PRIOR_EXPIRATION_DATE);
    });
  });

  describe('user-initiated policy write authorization', () => {
    const actingUserOptions = {
      userWorkspaceId: USER_WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    };

    it('skips items the acting user may not write and counts them as skipped', async () => {
      const { service, policyRepo, reviewItemRepo } = createService({
        reviewItems: [createReviewItem()],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        assertUserMayWritePolicy: jest
          .fn()
          .mockRejectedValue(
            new ForbiddenError(
              'Editing this record violates row-level security',
            ),
          ),
      });

      const result = await batchApplyOne(service, actingUserOptions);

      expect(result).toEqual({ updatedCount: 0, skippedCount: 1 });
      expect(policyRepo.update).not.toHaveBeenCalled();
      expect(reviewItemRepo.update).not.toHaveBeenCalled();
    });

    it('applies items when the acting user is authorized', async () => {
      const { service, reviewItemRepo, assertUserMayWritePolicy } =
        createService({
          reviewItems: [createReviewItem()],
          matchedPolicy: {
            id: MATCHED_POLICY_ID,
            leadId: LEAD_ID,
            agentId: 'agent-profile-id',
            createdAt: '2026-06-01T00:00:00.000Z',
          },
        });

      const result = await batchApplyOne(service, actingUserOptions);

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(assertUserMayWritePolicy).toHaveBeenCalledTimes(1);
      expect(assertUserMayWritePolicy).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: USER_WORKSPACE_ID,
        workspaceMemberId: WORKSPACE_MEMBER_ID,
        policy: {
          id: MATCHED_POLICY_ID,
          agentId: 'agent-profile-id',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      });
      expect(reviewItemRepo.update).toHaveBeenCalledWith(
        REVIEW_ITEM_ID,
        expect.objectContaining({ decision: 'APPROVED' }),
        expect.anything(),
      );
    });

    it('authorizes the cancel target as well on user-initiated applies', async () => {
      const { service, assertUserMayWritePolicy } = createService({
        reviewItems: [
          createReviewItem({
            bobRowSnapshot: {
              __cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
              __cancelExpireDate: CANCEL_EXPIRE_DATE,
            },
          }),
        ],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        policiesById: {
          [PREVIOUS_POLICY_ID]: { id: PREVIOUS_POLICY_ID, leadId: LEAD_ID },
        },
      });

      await batchApplyOne(service, actingUserOptions);

      expect(assertUserMayWritePolicy).toHaveBeenCalledTimes(2);
      expect(assertUserMayWritePolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          policy: expect.objectContaining({ id: PREVIOUS_POLICY_ID }),
        }),
      );
    });

    it('does not run policy write authorization without an acting user', async () => {
      const { service, assertUserMayWritePolicy } = createService({
        reviewItems: [createReviewItem()],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
      });

      const result = await batchApplyOne(service);

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(assertUserMayWritePolicy).not.toHaveBeenCalled();
    });
  });

  describe('reconcileMatchResults', () => {
    const CARRIER_POLICY_NUMBER = 'U123';

    const newMatchItem = (
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      name: `${CARRIER_POLICY_NUMBER} → ${CARRIER_POLICY_NUMBER}`,
      category: 'UPDATE',
      decision: 'PENDING',
      policyId: MATCHED_POLICY_ID,
      carrierPolicyNumber: CARRIER_POLICY_NUMBER,
      reconciliationId: RECONCILIATION_ID,
      ...overrides,
    });

    it('preserves decided items untouched and skips their duplicates from the new run', async () => {
      const approved = createReviewItem({
        id: 'approved-id',
        decision: 'APPROVED',
        category: 'UPDATE',
        carrierPolicyNumber: CARRIER_POLICY_NUMBER,
      });
      const { service, reviewItemRepo, transaction } = createService({
        reviewItems: [approved],
        matchedPolicy: null,
      });

      const result = await service.reconcileMatchResults(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        [newMatchItem()],
      );

      expect(result).toEqual({
        createdCount: 0,
        refreshedCount: 0,
        deletedStaleCount: 0,
        preservedDecidedCount: 1,
        skippedDecidedDuplicateCount: 1,
      });
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(reviewItemRepo.save).not.toHaveBeenCalled();
      expect(reviewItemRepo.update).not.toHaveBeenCalled();
      expect(reviewItemRepo.delete).not.toHaveBeenCalled();
    });

    it('refreshes matching pending items in place', async () => {
      const pending = createReviewItem({
        id: 'pending-id',
        decision: 'PENDING',
        category: 'UPDATE',
        carrierPolicyNumber: CARRIER_POLICY_NUMBER,
      });
      const refreshed = newMatchItem({
        fieldDiffs: [{ field: 'premium' }],
      });
      const { service, reviewItemRepo } = createService({
        reviewItems: [pending],
        matchedPolicy: null,
      });

      const result = await service.reconcileMatchResults(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        [refreshed],
      );

      expect(result.refreshedCount).toBe(1);
      expect(result.createdCount).toBe(0);
      expect(result.deletedStaleCount).toBe(0);
      expect(reviewItemRepo.update).toHaveBeenCalledWith(
        'pending-id',
        refreshed,
        {},
      );
      expect(reviewItemRepo.save).not.toHaveBeenCalled();
      expect(reviewItemRepo.delete).not.toHaveBeenCalled();
    });

    it('creates new items before deleting stale pending ones, all in one transaction', async () => {
      const stalePending = createReviewItem({
        id: 'stale-id',
        decision: 'PENDING',
        category: 'UPDATE',
        policyId: 'old-policy-id',
        carrierPolicyNumber: 'U777',
      });
      const brandNew = newMatchItem();
      const { service, reviewItemRepo, transaction } = createService({
        reviewItems: [stalePending],
        matchedPolicy: null,
      });

      const result = await service.reconcileMatchResults(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        [brandNew],
      );

      expect(result.createdCount).toBe(1);
      expect(result.deletedStaleCount).toBe(1);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(reviewItemRepo.save).toHaveBeenCalledWith(
        [brandNew],
        undefined,
        {},
      );
      expect(reviewItemRepo.delete).toHaveBeenCalledWith(['stale-id'], {});
      // Safest ordering even if the transaction degrades: create before delete
      expect(reviewItemRepo.save.mock.invocationCallOrder[0]).toBeLessThan(
        reviewItemRepo.delete.mock.invocationCallOrder[0],
      );
    });

    it('matches legacy decided items through the snapshot policy-number header', async () => {
      const legacyApproved = createReviewItem({
        id: 'legacy-approved-id',
        decision: 'APPROVED',
        category: 'UPDATE',
        carrierPolicyNumber: null,
        bobRowSnapshot: { 'Policy Number': CARRIER_POLICY_NUMBER },
      });
      const { service, reviewItemRepo } = createService({
        reviewItems: [legacyApproved],
        matchedPolicy: null,
      });

      const result = await service.reconcileMatchResults(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        [newMatchItem()],
        { policyNumberHeader: 'Policy Number' },
      );

      expect(result.skippedDecidedDuplicateCount).toBe(1);
      expect(reviewItemRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('fetchOverrides', () => {
    const CARRIER_NAME = 'Ambetter';

    it('scopes the query to the carrier, with null-carrier clauses for legacy items only', async () => {
      const { service, reviewItemRepo } = createService({
        reviewItems: [],
        matchedPolicy: null,
      });

      await service.fetchOverrides(WORKSPACE_ID, CARRIER_NAME);

      expect(reviewItemRepo.find).toHaveBeenCalledWith({
        where: [
          {
            decision: 'APPROVED',
            category: 'UNMATCHED',
            carrierName: CARRIER_NAME,
          },
          {
            decision: 'APPROVED',
            category: 'UNMATCHED',
            carrierName: IsNull(),
          },
          {
            decision: 'APPROVED',
            matchMethod: 'POLICY_NUMBER_MULTI_BEST',
            carrierName: CARRIER_NAME,
          },
          {
            decision: 'APPROVED',
            matchMethod: 'POLICY_NUMBER_MULTI_BEST',
            carrierName: IsNull(),
          },
        ],
      });
    });

    it('reads the policy number from the typed carrierPolicyNumber column', async () => {
      const { service } = createService({
        reviewItems: [
          createReviewItem({
            decision: 'APPROVED',
            category: 'UNMATCHED',
            carrierPolicyNumber: 'U123',
            carrierName: CARRIER_NAME,
            // Snapshot deliberately disagrees — the typed column must win
            bobRowSnapshot: { 'Policy Number': 'WRONG' },
          }),
        ],
        matchedPolicy: null,
      });

      await expect(
        service.fetchOverrides(WORKSPACE_ID, CARRIER_NAME),
      ).resolves.toEqual([
        {
          policyNumber: 'U123',
          crmPolicyId: MATCHED_POLICY_ID,
          carrierName: CARRIER_NAME,
        },
      ]);
    });

    it('falls back to snapshot headers for legacy items without the column', async () => {
      const { service } = createService({
        reviewItems: [
          createReviewItem({
            decision: 'APPROVED',
            category: 'UNMATCHED',
            carrierPolicyNumber: null,
            carrierName: null,
            bobRowSnapshot: { 'Policy Number': 'U456' },
          }),
        ],
        matchedPolicy: null,
      });

      await expect(
        service.fetchOverrides(WORKSPACE_ID, CARRIER_NAME),
      ).resolves.toEqual([
        {
          policyNumber: 'U456',
          crmPolicyId: MATCHED_POLICY_ID,
          carrierName: CARRIER_NAME,
        },
      ]);
    });

    it('skips items without a policyId or a resolvable policy number', async () => {
      const { service } = createService({
        reviewItems: [
          createReviewItem({
            decision: 'APPROVED',
            category: 'UNMATCHED',
            policyId: null,
            carrierPolicyNumber: 'U123',
          }),
          createReviewItem({
            decision: 'APPROVED',
            category: 'UNMATCHED',
            carrierPolicyNumber: null,
            bobRowSnapshot: { Unrelated: 'value' },
          }),
        ],
        matchedPolicy: null,
      });

      await expect(
        service.fetchOverrides(WORKSPACE_ID, CARRIER_NAME),
      ).resolves.toEqual([]);
    });
  });

  describe('learned-rule auto-apply safety (1.5/1.6)', () => {
    const CARRIER_NAME = 'Ambetter';
    const RULE_ID = 'rule-id';

    const statusOnlyOverrides = (): Record<string, unknown> => ({
      category: 'UPDATE',
      matchMethod: 'POLICY_NUMBER_SINGLE',
      statusChangeReason: 'Policy not eligible for commission',
      flags: ['STATUS_CHANGE'],
      fieldDiffs: [
        {
          field: 'status',
          crmField: 'status',
          crmObjectType: 'policy',
          bobValue: 'CANCELED',
          crmValue: 'ACTIVE_PLACED',
        },
      ],
    });

    const signatureHashFor = (item: Record<string, unknown>): string => {
      const probe = new ReconciliationDecisionRuleService({} as never);
      const result = probe.buildStatusRuleSignature(
        item as never,
        CARRIER_NAME,
      );

      if (!result) throw new Error('fixture is not status-only');

      return result.signatureHash;
    };

    const createRule = (
      id: string,
      signatureHash: string,
    ): ReconciliationDecisionRuleRecord & Record<string, unknown> => ({
      id,
      name: 'Ambetter: ACTIVE_PLACED -> CANCELED',
      ruleType: 'STATUS_UPDATE',
      isActive: true,
      signatureHash,
      signature: null,
      carrierName: CARRIER_NAME,
      fromStatus: 'ACTIVE_PLACED',
      toStatus: 'CANCELED',
      sourceReviewItemId: 'source-item-id',
      sourceReconciliationId: 'source-reconciliation-id',
      createdByUserWorkspaceId: null,
      approvedCount: 1,
      autoAppliedCount: 0,
      lastSeenAt: null,
      lastAppliedAt: null,
      deactivatedAt: null,
      deactivationReason: null,
    });

    it('auto-applies a pending status-only item matching an active rule', async () => {
      const item = createReviewItem(statusOnlyOverrides());
      const rule = createRule(RULE_ID, signatureHashFor(item));
      const { service, policyRepo } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        decisionRules: [rule],
      });

      const result = await service.applyLearnedRulesForReconciliation(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        { carrierName: CARRIER_NAME, rules: [rule] },
      );

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(policyRepo.update).toHaveBeenCalledWith(
        MATCHED_POLICY_ID,
        {
          status: 'CANCELED',
        },
        expect.anything(),
      );
      expect(item.decision).toBe('APPROVED');
      expect(item.decisionSource).toBe('AUTO_RULE');
      expect(item.decisionRuleId).toBe(RULE_ID);
      expect(item.decisionRuleSignatureHash).toBe(rule.signatureHash);
      expect(item.autoAppliedAt).toEqual(expect.any(String));
      expect(rule.autoAppliedCount).toBe(1);
    });

    it('never auto-applies a cancel-bearing pending item, even when a rule matches its status shape', async () => {
      const cleanShape = createReviewItem(statusOnlyOverrides());
      const item = createReviewItem({
        ...statusOnlyOverrides(),
        cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
      });
      const rule = createRule(RULE_ID, signatureHashFor(cleanShape));
      const { service, policyRepo } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        policiesById: {
          [PREVIOUS_POLICY_ID]: { id: PREVIOUS_POLICY_ID, leadId: LEAD_ID },
        },
        decisionRules: [rule],
      });

      const result = await service.applyLearnedRulesForReconciliation(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        { carrierName: CARRIER_NAME, rules: [rule] },
      );

      expect(result).toEqual({ updatedCount: 0, skippedCount: 0 });
      expect(policyRepo.update).not.toHaveBeenCalled();
      expect(item.decision).toBe('PENDING');
    });

    it('never executes a requested cancel when the apply is auto-rule-sourced (defense in depth)', async () => {
      const item = createReviewItem({
        cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
        bobRowSnapshot: { __cancelExpireDate: CANCEL_EXPIRE_DATE },
      });
      const { service, policyRepo, reviewItemRepo } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        policiesById: {
          [PREVIOUS_POLICY_ID]: {
            id: PREVIOUS_POLICY_ID,
            leadId: LEAD_ID,
            status: 'ACTIVE_PLACED',
          },
        },
      });

      const result = await batchApplyOne(service, { source: 'AUTO_RULE' });

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      // No cancel write, and no prior-state capture either
      expect(policyRepo.update).not.toHaveBeenCalled();
      expect(reviewItemRepo.update).toHaveBeenCalledTimes(1);
      expect(item.cancelPriorStatus).toBeUndefined();
      expect(item.decision).toBe('APPROVED');
    });

    it('undoing an auto-applied item deactivates the rule and the item is never re-applied', async () => {
      const item = createReviewItem(statusOnlyOverrides());
      const signatureHash = signatureHashFor(item);
      const rule = createRule(RULE_ID, signatureHash);
      const { service } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        decisionRules: [rule],
      });

      // 1. The rule auto-applies the pending item.
      const applied = await service.applyLearnedRulesForReconciliation(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        { carrierName: CARRIER_NAME, rules: [rule] },
      );

      expect(applied.updatedCount).toBe(1);
      expect(item.decisionSource).toBe('AUTO_RULE');

      // 2. A user undoes it: the rule it came from is deactivated with a
      // recorded reason, and the item keeps its signature hash as a veto
      // marker while returning to PENDING.
      await service.batchApply(WORKSPACE_ID, RECONCILIATION_ID, 'UNDO', {
        reviewItemIds: [REVIEW_ITEM_ID],
      });

      expect(item.decision).toBe('PENDING');
      expect(item.decisionSource).toBeNull();
      expect(item.decisionRuleId).toBeNull();
      expect(item.decisionRuleSignatureHash).toBe(signatureHash);
      expect(rule.isActive).toBe(false);
      expect(rule.deactivatedAt).toEqual(expect.any(String));
      expect(rule.deactivationReason).toBe(
        `Auto-applied review item ${REVIEW_ITEM_ID} was undone by a user`,
      );

      // 3. Even a freshly re-learned ACTIVE rule with the same signature
      // cannot re-apply the human-vetoed item.
      const relearnedRule = createRule('relearned-rule-id', signatureHash);
      const rerun = await service.applyLearnedRulesForReconciliation(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        { carrierName: CARRIER_NAME, rules: [relearnedRule] },
      );

      expect(rerun).toEqual({ updatedCount: 0, skippedCount: 0 });
      expect(item.decision).toBe('PENDING');
    });

    it('undoing a user-applied item still deactivates rules sourced from it', async () => {
      const item = createReviewItem({
        ...statusOnlyOverrides(),
        decision: 'APPROVED',
        decisionSource: 'USER',
        decisionRuleId: RULE_ID,
        decisionRuleSignatureHash: 'source-signature-hash',
      });
      const rule = createRule(RULE_ID, 'source-signature-hash');

      rule.sourceReviewItemId = REVIEW_ITEM_ID;

      const { service } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        decisionRules: [rule],
      });

      await service.batchApply(WORKSPACE_ID, RECONCILIATION_ID, 'UNDO', {
        reviewItemIds: [REVIEW_ITEM_ID],
      });

      expect(rule.isActive).toBe(false);
      expect(rule.deactivationReason).toBe(
        `Source review item ${REVIEW_ITEM_ID} was undone by a user`,
      );
      expect(item.decision).toBe('PENDING');
    });
  });

  describe('batch prefetch + per-item transactions (2.6)', () => {
    const statusDiff = {
      field: 'status',
      crmField: 'status',
      crmObjectType: 'policy',
      bobValue: 'CANCELED',
      crmValue: 'ACTIVE_PLACED',
      action: 'UPDATE',
    };

    it('prefetches all candidate policies and cancel targets in one IN-query with the lead relation', async () => {
      const itemA = createReviewItem({
        id: 'item-a',
        policyId: 'policy-a',
        fieldDiffs: [statusDiff],
      });
      const itemB = createReviewItem({
        id: 'item-b',
        policyId: 'policy-b',
        cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
        bobRowSnapshot: { __cancelExpireDate: CANCEL_EXPIRE_DATE },
      });
      const { service, policyRepo } = createService({
        reviewItems: [itemA, itemB],
        matchedPolicy: null,
        policiesById: {
          'policy-a': { id: 'policy-a', leadId: LEAD_ID },
          'policy-b': { id: 'policy-b', leadId: LEAD_ID },
          [PREVIOUS_POLICY_ID]: {
            id: PREVIOUS_POLICY_ID,
            leadId: LEAD_ID,
            status: 'ACTIVE_PLACED',
          },
        },
      });

      const result = await service.batchApply(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'APPLY',
        { reviewItemIds: ['item-a', 'item-b'] },
        { learnRules: false },
      );

      expect(result).toEqual({ updatedCount: 2, skippedCount: 0 });
      // One IN-query for both matched policies AND the cancel target —
      // never a per-item fetch.
      expect(policyRepo.find).toHaveBeenCalledTimes(1);
      expect(policyRepo.find).toHaveBeenCalledWith({
        where: { id: In(['policy-a', 'policy-b', PREVIOUS_POLICY_ID]) },
        relations: ['lead'],
      });
      expect(policyRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(policyRepo.findOne).not.toHaveBeenCalled();
    });

    it('learned-rule auto-apply resolves its policies through the same single prefetch', async () => {
      const CARRIER_NAME = 'Ambetter';
      const item = createReviewItem({
        category: 'UPDATE',
        matchMethod: 'POLICY_NUMBER_SINGLE',
        statusChangeReason: 'Policy not eligible for commission',
        flags: ['STATUS_CHANGE'],
        fieldDiffs: [statusDiff],
      });
      const probe = new ReconciliationDecisionRuleService({} as never);
      const signatureResult = probe.buildStatusRuleSignature(
        item as never,
        CARRIER_NAME,
      );
      const rule = {
        id: 'rule-id',
        name: 'rule',
        ruleType: 'STATUS_UPDATE',
        isActive: true,
        signatureHash: signatureResult!.signatureHash,
      } as ReconciliationDecisionRuleRecord;
      const { service, policyRepo } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
        decisionRules: [rule as DecisionRuleRecord],
      });

      const result = await service.applyLearnedRulesForReconciliation(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        { carrierName: CARRIER_NAME, rules: [rule] },
      );

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      expect(policyRepo.find).toHaveBeenCalledTimes(1);
      expect(policyRepo.find).toHaveBeenCalledWith({
        where: { id: In([MATCHED_POLICY_ID]) },
        relations: ['lead'],
      });
      expect(policyRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("wraps each item's policy, cancel, and decision writes in one transaction", async () => {
      const item = createReviewItem({
        cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
        bobRowSnapshot: { __cancelExpireDate: CANCEL_EXPIRE_DATE },
        fieldDiffs: [statusDiff],
      });
      const { service, transaction, policyRepo, reviewItemRepo } =
        createService({
          reviewItems: [item],
          matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
          policiesById: {
            [PREVIOUS_POLICY_ID]: {
              id: PREVIOUS_POLICY_ID,
              leadId: LEAD_ID,
              status: 'ACTIVE_PLACED',
            },
          },
        });

      await batchApplyOne(service);

      // One transaction for the item; every write inside carries its
      // entity manager so the decision flag and the CRM mutations commit
      // together.
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(policyRepo.update.mock.calls.length).toBeGreaterThan(0);
      expect(reviewItemRepo.update.mock.calls.length).toBeGreaterThan(0);
      for (const call of [
        ...policyRepo.update.mock.calls,
        ...reviewItemRepo.update.mock.calls,
      ] as unknown[][]) {
        expect(call[2]).toBeDefined();
      }
    });

    it('opens one transaction per applied item', async () => {
      const itemA = createReviewItem({
        id: 'item-a',
        policyId: 'policy-a',
        fieldDiffs: [statusDiff],
      });
      const itemB = createReviewItem({
        id: 'item-b',
        policyId: 'policy-b',
        fieldDiffs: [statusDiff],
      });
      const { service, transaction } = createService({
        reviewItems: [itemA, itemB],
        matchedPolicy: null,
        policiesById: {
          'policy-a': { id: 'policy-a', leadId: LEAD_ID },
          'policy-b': { id: 'policy-b', leadId: LEAD_ID },
        },
      });

      await service.batchApply(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'APPLY',
        { reviewItemIds: ['item-a', 'item-b'] },
        { learnRules: false },
      );

      expect(transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('REVIEW → COMPLETED wiring', () => {
    it('completes the run when an APPLY decides the last pending item', async () => {
      const { service, stateMachine } = createService({
        reviewItems: [createReviewItem()],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
      });

      await batchApplyOne(service);

      expect(stateMachine.transition).toHaveBeenCalledTimes(1);
      expect(stateMachine.transition).toHaveBeenCalledWith(
        WORKSPACE_ID,
        RECONCILIATION_ID,
        'REVIEW',
        'COMPLETED',
        { completedAt: expect.any(String) },
      );
    });

    it('does not transition while other items remain pending', async () => {
      const { service, stateMachine } = createService({
        reviewItems: [
          createReviewItem(),
          createReviewItem({ id: 'still-pending-id' }),
        ],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
      });

      await batchApplyOne(service);

      expect(stateMachine.transition).not.toHaveBeenCalled();
    });

    it('does not transition on UNDO', async () => {
      const { service, stateMachine } = createService({
        reviewItems: [createReviewItem({ decision: 'APPROVED' })],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
      });

      await service.batchApply(WORKSPACE_ID, RECONCILIATION_ID, 'UNDO', {
        reviewItemIds: [REVIEW_ITEM_ID],
      });

      expect(stateMachine.transition).not.toHaveBeenCalled();
    });

    it('does not transition when nothing was applied', async () => {
      // Zero PENDING items in the store, but the APPLY also updates nothing
      // (UNMATCHED items are never batch candidates) — completion must not
      // fire from a no-op batch.
      const { service, stateMachine } = createService({
        reviewItems: [
          createReviewItem({ decision: 'APPROVED', category: 'UNMATCHED' }),
        ],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
      });

      const result = await batchApplyOne(service);

      expect(result).toEqual({ updatedCount: 0, skippedCount: 0 });
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });

    it('treats a transition conflict as a benign no-op', async () => {
      const item = createReviewItem();
      const { service, stateMachine } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
      });

      stateMachine.transition.mockRejectedValue(
        new TransitionConflictError(RECONCILIATION_ID, 'REVIEW', 'COMPLETED'),
      );

      await expect(batchApplyOne(service)).resolves.toEqual({
        updatedCount: 1,
        skippedCount: 0,
      });
      expect(item.decision).toBe('APPROVED');
    });

    it('rethrows non-conflict transition errors', async () => {
      const { service, stateMachine } = createService({
        reviewItems: [createReviewItem()],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
      });

      stateMachine.transition.mockRejectedValue(new Error('database down'));

      await expect(batchApplyOne(service)).rejects.toThrow('database down');
    });
  });

  describe('INFO_ONLY diffs are never written (2.1)', () => {
    it('skips INFO_ONLY diffs even when they carry a crmField', async () => {
      const item = createReviewItem({
        fieldDiffs: [
          {
            field: 'premium',
            crmField: 'premium',
            crmObjectType: 'policy',
            bobValue: '120',
            crmValue: '100',
            action: 'INFO_ONLY',
          },
          {
            field: 'status',
            crmField: 'status',
            crmObjectType: 'policy',
            bobValue: 'CANCELED',
            crmValue: 'ACTIVE_PLACED',
            action: 'UPDATE',
          },
        ],
      });
      const { service, policyRepo } = createService({
        reviewItems: [item],
        matchedPolicy: { id: MATCHED_POLICY_ID, leadId: LEAD_ID },
      });

      const result = await batchApplyOne(service);

      expect(result).toEqual({ updatedCount: 1, skippedCount: 0 });
      // Only the UPDATE diff is written; the INFO_ONLY premium diff is
      // ignored even though its crmField is populated.
      expect(policyRepo.update).toHaveBeenCalledTimes(1);
      expect(policyRepo.update).toHaveBeenCalledWith(
        MATCHED_POLICY_ID,
        { status: 'CANCELED' },
        expect.anything(),
      );
      expect(item.decision).toBe('APPROVED');
    });
  });

  describe('shared batch-apply policy constants (2.7)', () => {
    it('pins the server flag lists to the shared twenty-shared constant', () => {
      expect([...ReviewItemService.BATCH_APPROVE_BLOCKING_FLAGS]).toEqual([
        ...RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS,
      ]);
      // decision-rule.service.ts keeps its own literal list (the file is
      // frozen by the fork's no-touch policy); this assertion pins it to
      // the shared source so any drift fails CI.
      expect([...RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS]).toEqual([
        ...RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS,
      ]);
    });
  });
});
