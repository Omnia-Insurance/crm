import { IsNull } from 'typeorm';

import { BackfillReconciliationDecisionRulesCommand } from 'src/database/commands/custom/backfill-reconciliation-decision-rules.command';
import { type ReviewItemForDecisionRule } from 'src/modules/reconciliation/services/decision-rule.service';

const WORKSPACE_ID = 'workspace-id';
const RECONCILIATION_ID = 'reconciliation-id';
const CARRIER_NAME = 'Ambetter';

const createApprovedItem = (
  id: string,
  overrides: Partial<ReviewItemForDecisionRule> = {},
): ReviewItemForDecisionRule => ({
  id,
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
    },
  ],
  decisionSource: 'USER',
  decisionRuleId: null,
  decisionRuleSignatureHash: null,
  autoAppliedAt: null,
  ...overrides,
});

const createCommand = ({ items }: { items: ReviewItemForDecisionRule[] }) => {
  const reviewItemRepo = {
    find: jest.fn(async () => items),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn(async () => reviewItemRepo),
  };
  const decisionRuleService = {
    getCarrierNameForReconciliation: jest.fn(async () => CARRIER_NAME),
    buildStatusRuleSignature: jest.fn((item: ReviewItemForDecisionRule) => ({
      signature: { ruleType: 'STATUS_UPDATE' },
      signatureHash: `hash-of-${item.id}`,
      statusDiff: item.fieldDiffs?.[0],
    })),
    upsertRulesFromReviewItems: jest.fn(async () => []),
  };
  const reviewItemService = {
    applyLearnedRulesForReconciliation: jest.fn(async () => ({
      updatedCount: 0,
      skippedCount: 0,
    })),
  };
  const command = new BackfillReconciliationDecisionRulesCommand(
    {} as never,
    globalWorkspaceOrmManager as never,
    decisionRuleService as never,
    reviewItemService as never,
  );

  return {
    command,
    reviewItemRepo,
    decisionRuleService,
    reviewItemService,
  };
};

const runOnWorkspace = (
  command: BackfillReconciliationDecisionRulesCommand,
  options: Record<string, unknown> = {},
) =>
  command.runOnWorkspace({
    workspaceId: WORKSPACE_ID,
    options,
    index: 0,
    total: 1,
  });

describe('BackfillReconciliationDecisionRulesCommand', () => {
  describe('isHumanApprovedReviewItem', () => {
    it('accepts USER, BATCH_USER, and legacy null decision sources', () => {
      for (const decisionSource of ['USER', 'BATCH_USER', null] as const) {
        expect(
          BackfillReconciliationDecisionRulesCommand.isHumanApprovedReviewItem(
            createApprovedItem('item', { decisionSource }),
          ),
        ).toBe(true);
      }
    });

    it('rejects AUTO_RULE approvals', () => {
      expect(
        BackfillReconciliationDecisionRulesCommand.isHumanApprovedReviewItem(
          createApprovedItem('item', { decisionSource: 'AUTO_RULE' }),
        ),
      ).toBe(false);
    });

    it('rejects anything auto-applied regardless of its decision source', () => {
      expect(
        BackfillReconciliationDecisionRulesCommand.isHumanApprovedReviewItem(
          createApprovedItem('item', {
            decisionSource: 'USER',
            autoAppliedAt: '2026-06-01T00:00:00.000Z',
          }),
        ),
      ).toBe(false);
    });
  });

  it('queries only human decision sources (USER, BATCH_USER, legacy null)', async () => {
    const { command, reviewItemRepo } = createCommand({ items: [] });

    await runOnWorkspace(command);

    expect(reviewItemRepo.find).toHaveBeenCalledWith({
      where: [
        {
          decision: 'APPROVED',
          category: 'UPDATE',
          decisionSource: 'USER',
        },
        {
          decision: 'APPROVED',
          category: 'UPDATE',
          decisionSource: 'BATCH_USER',
        },
        {
          decision: 'APPROVED',
          category: 'UPDATE',
          decisionSource: IsNull(),
        },
      ],
    });
  });

  it('never learns from machine-decided items that slip past the query filter', async () => {
    const humanItem = createApprovedItem('human-item');
    const machineItem = createApprovedItem('machine-item', {
      // Legacy corruption shape: null decisionSource (matches the query)
      // but a populated autoAppliedAt proves the rule engine decided it.
      decisionSource: null,
      autoAppliedAt: '2026-06-01T00:00:00.000Z',
      decisionRuleId: 'rule-id',
      decisionRuleSignatureHash: 'machine-hash',
    });
    const { command, decisionRuleService } = createCommand({
      items: [humanItem, machineItem],
    });

    await runOnWorkspace(command);

    expect(decisionRuleService.buildStatusRuleSignature).toHaveBeenCalledWith(
      humanItem,
      CARRIER_NAME,
    );
    expect(
      decisionRuleService.buildStatusRuleSignature,
    ).not.toHaveBeenCalledWith(machineItem, CARRIER_NAME);
    expect(decisionRuleService.upsertRulesFromReviewItems).toHaveBeenCalledWith(
      {
        workspaceId: WORKSPACE_ID,
        carrierName: CARRIER_NAME,
        items: [humanItem],
        createdByUserWorkspaceId: null,
      },
    );
  });

  it('does not write anything on a dry run', async () => {
    const { command, decisionRuleService } = createCommand({
      items: [createApprovedItem('human-item')],
    });

    await runOnWorkspace(command, { dryRun: true });

    expect(
      decisionRuleService.upsertRulesFromReviewItems,
    ).not.toHaveBeenCalled();
  });

  it('auto-applies to the requested reconciliation after backfilling', async () => {
    const { command, reviewItemService } = createCommand({
      items: [createApprovedItem('human-item')],
    });

    await runOnWorkspace(command, {
      applyToReconciliationId: RECONCILIATION_ID,
    });

    expect(
      reviewItemService.applyLearnedRulesForReconciliation,
    ).toHaveBeenCalledWith(WORKSPACE_ID, RECONCILIATION_ID);
  });
});
