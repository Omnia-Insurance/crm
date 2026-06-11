import {
  ReconciliationDecisionRuleService,
  type ReconciliationDecisionRuleRecord,
  type ReviewItemForDecisionRule,
} from 'src/modules/reconciliation/services/decision-rule.service';

const CARRIER_NAME = 'Ambetter';
const RULE_ID = 'rule-id';
const REVIEW_ITEM_ID = 'review-item-id';
const RECONCILIATION_ID = 'reconciliation-id';
const PREVIOUS_POLICY_ID = 'previous-policy-id';
const SIGNATURE_HASH = 'signature-hash';

type RuleRecord = ReconciliationDecisionRuleRecord & Record<string, unknown>;

const createStatusOnlyItem = (
  overrides: Partial<ReviewItemForDecisionRule> = {},
): ReviewItemForDecisionRule => ({
  id: REVIEW_ITEM_ID,
  reconciliationId: RECONCILIATION_ID,
  decision: 'APPROVED',
  category: 'UPDATE',
  matchMethod: 'POLICY_NUMBER_SINGLE',
  statusChangeReason: 'Policy not eligible for commission',
  flags: ['STATUS_CHANGE'],
  fieldDiffs: [
    {
      field: 'status',
      crmField: 'status',
      bobValue: 'CANCELED',
      crmValue: 'ACTIVE_PLACED',
      note: null,
    },
  ],
  ...overrides,
});

const createRule = (overrides: Partial<RuleRecord> = {}): RuleRecord => ({
  id: RULE_ID,
  name: 'Ambetter: ACTIVE_PLACED -> CANCELED',
  ruleType: 'STATUS_UPDATE',
  isActive: true,
  signatureHash: SIGNATURE_HASH,
  signature: null,
  carrierName: CARRIER_NAME,
  fromStatus: 'ACTIVE_PLACED',
  toStatus: 'CANCELED',
  sourceReviewItemId: 'source-item-id',
  sourceReconciliationId: 'source-reconciliation-id',
  createdByUserWorkspaceId: null,
  approvedCount: 3,
  autoAppliedCount: 0,
  lastSeenAt: null,
  lastAppliedAt: null,
  deactivatedAt: null,
  deactivationReason: null,
  ...overrides,
});

const matchesWhere = (
  record: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean =>
  Object.entries(where).every(([key, value]) => record[key] === value);

const createService = ({
  rules = [],
  reviewItems = [],
}: {
  rules?: RuleRecord[];
  reviewItems?: Record<string, unknown>[];
} = {}) => {
  const ruleRepo = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rules.filter((rule) => matchesWhere(rule, where)),
    ),
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rules.find((rule) => matchesWhere(rule, where)) ?? null,
    ),
    update: jest.fn(async (id: string, updates: Record<string, unknown>) => {
      const rule = rules.find((candidate) => candidate.id === id);

      if (rule) Object.assign(rule, updates);
    }),
    save: jest.fn(async (rule: Record<string, unknown>) => {
      const saved = { id: 'new-rule-id', ...rule } as RuleRecord;

      rules.push(saved);

      return saved;
    }),
  };
  const reviewItemRepo = {
    update: jest.fn(async (id: string, updates: Record<string, unknown>) => {
      const item = reviewItems.find((candidate) => candidate.id === id);

      if (item) Object.assign(item, updates);
    }),
  };
  const reposByObjectName: Record<string, unknown> = {
    reconciliationDecisionRule: ruleRepo,
    reviewItem: reviewItemRepo,
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn(
      async (_workspaceId: string, objectName: string) =>
        reposByObjectName[objectName],
    ),
  };
  const service = new ReconciliationDecisionRuleService(
    globalWorkspaceOrmManager as never,
  );

  return { service, ruleRepo, reviewItemRepo };
};

describe('ReconciliationDecisionRuleService', () => {
  describe('buildStatusRuleSignature', () => {
    it('builds a signature for a status-only item', () => {
      const { service } = createService();

      const result = service.buildStatusRuleSignature(
        createStatusOnlyItem(),
        CARRIER_NAME,
      );

      expect(result).not.toBeNull();
      expect(result?.signature).toMatchObject({
        ruleType: 'STATUS_UPDATE',
        carrierName: CARRIER_NAME,
        fromStatus: 'ACTIVE_PLACED',
        toStatus: 'CANCELED',
      });
    });

    it('returns null when the first-class cancelPreviousPolicyId column is set', () => {
      const { service } = createService();

      const result = service.buildStatusRuleSignature(
        createStatusOnlyItem({ cancelPreviousPolicyId: PREVIOUS_POLICY_ID }),
        CARRIER_NAME,
      );

      expect(result).toBeNull();
    });

    it('returns null when the legacy snapshot carries __cancelPreviousPolicyId', () => {
      const { service } = createService();

      const result = service.buildStatusRuleSignature(
        createStatusOnlyItem({
          bobRowSnapshot: { __cancelPreviousPolicyId: PREVIOUS_POLICY_ID },
        }),
        CARRIER_NAME,
      );

      expect(result).toBeNull();
    });

    it('returns null when the synthetic cancel diff is present', () => {
      const { service } = createService();
      const item = createStatusOnlyItem();

      item.fieldDiffs = [
        ...(item.fieldDiffs ?? []),
        {
          field: '__cancelPreviousPolicy',
          crmField: null,
          bobValue: 'Canceled as of 2026-05-31',
          crmValue: null,
        },
      ];

      expect(service.buildStatusRuleSignature(item, CARRIER_NAME)).toBeNull();
    });

    it('returns null for items with auto-rule blocking flags', () => {
      const { service } = createService();

      for (const flag of [
        'REINSTATEMENT',
        'BROKER_EFF_AUDIT',
        'MULTI_MATCH',
        'NAME_MISMATCH',
      ]) {
        const result = service.buildStatusRuleSignature(
          createStatusOnlyItem({ flags: [flag] }),
          CARRIER_NAME,
        );

        expect(result).toBeNull();
      }
    });

    it('returns null when a non-status actionable diff is present', () => {
      const { service } = createService();
      const item = createStatusOnlyItem();

      item.fieldDiffs = [
        ...(item.fieldDiffs ?? []),
        {
          field: 'premium',
          crmField: 'premium',
          bobValue: '120.00',
          crmValue: '110.00',
        },
      ];

      expect(service.buildStatusRuleSignature(item, CARRIER_NAME)).toBeNull();
    });

    it('returns null for unmatched items and missing carrier names', () => {
      const { service } = createService();

      expect(
        service.buildStatusRuleSignature(
          createStatusOnlyItem({ category: 'UNMATCHED' }),
          CARRIER_NAME,
        ),
      ).toBeNull();
      expect(
        service.buildStatusRuleSignature(createStatusOnlyItem(), null),
      ).toBeNull();
    });

    // Hash-drift guard (audit test-gap #1): these hashes are persisted on
    // rules and review items, so ANY change to the signature shape,
    // normalization, or stable stringification silently orphans every
    // learned rule. If this test fails you have changed the signature
    // semantics — bump ruleVersion and plan a rule migration instead of
    // updating the expected hash in place.
    it('produces stable signature hashes for fixed fixtures', () => {
      const { service } = createService();

      const resultA = service.buildStatusRuleSignature(
        createStatusOnlyItem(),
        CARRIER_NAME,
      );

      expect(resultA?.signature).toEqual({
        ruleVersion: 1,
        ruleType: 'STATUS_UPDATE',
        carrierName: 'Ambetter',
        fromStatus: 'ACTIVE_PLACED',
        toStatus: 'CANCELED',
        matchMethod: 'POLICY_NUMBER_SINGLE',
        statusReasonClass: 'NOT_ELIGIBLE_FOR_COMMISSION',
        paymentStateBucket: 'CANCELED',
        placementBasis: 'COMMISSION_ELIGIBILITY',
        expirationDateDiffPresent: false,
      });
      expect(resultA?.signatureHash).toBe(
        'c9fb4d744b807dd8ca27be3fdd76ca1480b665c8b297cd202126624cc754a0bf',
      );

      const resultB = service.buildStatusRuleSignature(
        createStatusOnlyItem({
          matchMethod: 'POLICY_NUMBER_DATE_AGENT',
          statusChangeReason: 'Term date 2026-05-31 is in the past',
          fieldDiffs: [
            {
              field: 'status',
              crmField: 'status',
              bobValue: 'CANCELED',
              crmValue: 'ACTIVE_PLACED',
              note: null,
            },
            {
              field: 'expirationDate',
              crmField: 'expirationDate',
              bobValue: '2026-05-31',
              crmValue: null,
            },
          ],
        }),
        CARRIER_NAME,
      );

      expect(resultB?.signature).toMatchObject({
        statusReasonClass: 'TERM_DATE_PAST',
        placementBasis: 'TERM_DATE',
        expirationDateDiffPresent: true,
      });
      expect(resultB?.signatureHash).toBe(
        '78974240cbce4d1715f54184f5b904d2e69ac30f2e47a6b5f1d2a7401f7fb3d8',
      );
    });
  });

  describe('upsertRulesFromReviewItems', () => {
    const WORKSPACE_ID = 'workspace-id';

    it('learns a rule from an unlinked human-approved item and links it', async () => {
      const item = createStatusOnlyItem();
      const { service } = createService({ reviewItems: [item] });
      const expectedHash = service.buildStatusRuleSignature(item, CARRIER_NAME)
        ?.signatureHash as string;
      const rules: RuleRecord[] = [
        createRule({ signatureHash: expectedHash, approvedCount: 3 }),
      ];
      const { service: linkedService, reviewItemRepo } = createService({
        rules,
        reviewItems: [item],
      });

      const result = await linkedService.upsertRulesFromReviewItems({
        workspaceId: WORKSPACE_ID,
        carrierName: CARRIER_NAME,
        items: [item],
      });

      expect(result).toHaveLength(1);
      expect(rules[0].approvedCount).toBe(4);
      expect(reviewItemRepo.update).toHaveBeenCalledWith(REVIEW_ITEM_ID, {
        decisionRuleId: RULE_ID,
        decisionRuleSignatureHash: expectedHash,
      });
    });

    it('is idempotent for items already linked to the same signature (no approvedCount inflation)', async () => {
      const probe = createService();
      const item = createStatusOnlyItem();
      const expectedHash = probe.service.buildStatusRuleSignature(
        item,
        CARRIER_NAME,
      )?.signatureHash as string;

      item.decisionRuleId = RULE_ID;
      item.decisionRuleSignatureHash = expectedHash;

      const rules: RuleRecord[] = [
        createRule({ signatureHash: expectedHash, approvedCount: 3 }),
      ];
      const { service, reviewItemRepo } = createService({
        rules,
        reviewItems: [item],
      });

      await service.upsertRulesFromReviewItems({
        workspaceId: WORKSPACE_ID,
        carrierName: CARRIER_NAME,
        items: [item],
      });

      expect(rules[0].approvedCount).toBe(3);
      expect(reviewItemRepo.update).not.toHaveBeenCalled();
    });

    it('never reactivates a rule a human deactivated', async () => {
      const probe = createService();
      const item = createStatusOnlyItem();
      const expectedHash = probe.service.buildStatusRuleSignature(
        item,
        CARRIER_NAME,
      )?.signatureHash as string;
      const rules: RuleRecord[] = [
        createRule({
          signatureHash: expectedHash,
          isActive: false,
          deactivatedAt: '2026-06-01T00:00:00.000Z',
          deactivationReason: 'Auto-applied review item x was undone by a user',
        }),
      ];
      const { service } = createService({ rules, reviewItems: [item] });

      const result = await service.upsertRulesFromReviewItems({
        workspaceId: WORKSPACE_ID,
        carrierName: CARRIER_NAME,
        items: [item],
      });

      expect(result).toHaveLength(1);
      expect(rules[0].isActive).toBe(false);
      expect(rules[0].deactivatedAt).toBe('2026-06-01T00:00:00.000Z');
      expect(rules[0].deactivationReason).toBe(
        'Auto-applied review item x was undone by a user',
      );
    });

    it('never learns from a cancel-bearing item', async () => {
      const item = createStatusOnlyItem({
        cancelPreviousPolicyId: PREVIOUS_POLICY_ID,
      });
      const rules: RuleRecord[] = [];
      const { service, ruleRepo } = createService({
        rules,
        reviewItems: [item],
      });

      const result = await service.upsertRulesFromReviewItems({
        workspaceId: WORKSPACE_ID,
        carrierName: CARRIER_NAME,
        items: [item],
      });

      expect(result).toEqual([]);
      expect(ruleRepo.save).not.toHaveBeenCalled();
      expect(ruleRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivateRuleForUndoneAutoApply', () => {
    const WORKSPACE_ID = 'workspace-id';

    it('deactivates the rule referenced by the undone item and records why', async () => {
      const rule = createRule();
      const { service, ruleRepo } = createService({ rules: [rule] });

      const count = await service.deactivateRuleForUndoneAutoApply({
        workspaceId: WORKSPACE_ID,
        ruleId: RULE_ID,
        signatureHash: SIGNATURE_HASH,
        undoneReviewItemId: REVIEW_ITEM_ID,
      });

      expect(count).toBe(1);
      expect(ruleRepo.update).toHaveBeenCalledWith(
        RULE_ID,
        expect.objectContaining({
          isActive: false,
          deactivatedAt: expect.any(String),
          deactivationReason: `Auto-applied review item ${REVIEW_ITEM_ID} was undone by a user`,
        }),
      );
    });

    it('falls back to the signature hash when the rule id is missing', async () => {
      const rule = createRule();
      const { service, ruleRepo } = createService({ rules: [rule] });

      const count = await service.deactivateRuleForUndoneAutoApply({
        workspaceId: WORKSPACE_ID,
        ruleId: null,
        signatureHash: SIGNATURE_HASH,
        undoneReviewItemId: REVIEW_ITEM_ID,
      });

      expect(count).toBe(1);
      expect(ruleRepo.update).toHaveBeenCalledWith(
        RULE_ID,
        expect.objectContaining({ isActive: false }),
      );
    });

    it('is a no-op when the rule is already inactive or unknown', async () => {
      const rule = createRule({ isActive: false });
      const { service, ruleRepo } = createService({ rules: [rule] });

      await expect(
        service.deactivateRuleForUndoneAutoApply({
          workspaceId: WORKSPACE_ID,
          ruleId: RULE_ID,
          signatureHash: null,
          undoneReviewItemId: REVIEW_ITEM_ID,
        }),
      ).resolves.toBe(0);
      await expect(
        service.deactivateRuleForUndoneAutoApply({
          workspaceId: WORKSPACE_ID,
          ruleId: null,
          signatureHash: null,
          undoneReviewItemId: REVIEW_ITEM_ID,
        }),
      ).resolves.toBe(0);
      expect(ruleRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivateRuleForSourceReviewItem', () => {
    it('stamps the human-deactivation marker', async () => {
      const rule = createRule({ sourceReviewItemId: REVIEW_ITEM_ID });
      const { service } = createService({ rules: [rule] });

      const count = await service.deactivateRuleForSourceReviewItem({
        workspaceId: 'workspace-id',
        sourceReviewItemId: REVIEW_ITEM_ID,
      });

      expect(count).toBe(1);
      expect(rule.isActive).toBe(false);
      expect(rule.deactivatedAt).toEqual(expect.any(String));
      expect(rule.deactivationReason).toBe(
        `Source review item ${REVIEW_ITEM_ID} was undone by a user`,
      );
    });
  });
});
