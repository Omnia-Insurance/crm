// OMNIA-CUSTOM: Backfills learned reconciliation decision rules from
// historical approved status review items.
//
// Run with:
// npx nx run twenty-server:command workspace:backfill-reconciliation-decision-rules

import { Command, Option } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { IsNull } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import {
  type RunOnWorkspaceArgs,
  type WorkspaceCommandOptions,
} from 'src/database/commands/command-runners/workspace.command-runner';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import {
  ReconciliationDecisionRuleService,
  type ReviewItemForDecisionRule,
} from 'src/modules/reconciliation/services/decision-rule.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';

type BackfillReconciliationDecisionRuleOptions = WorkspaceCommandOptions & {
  applyToReconciliationId?: string;
};

@Command({
  name: 'workspace:backfill-reconciliation-decision-rules',
  description:
    'Learn reconciliation decision rules from historical approved status review items.',
})
export class BackfillReconciliationDecisionRulesCommand extends ProvisionedWorkspaceCommandRunner<BackfillReconciliationDecisionRuleOptions> {
  @Option({
    flags: '--apply-to-reconciliation-id [reconciliation_id]',
    description:
      'After backfilling rules, auto-apply matching pending items in this reconciliation run.',
    required: false,
  })
  parseApplyToReconciliationId(value: string): string {
    return value;
  }

  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly decisionRuleService: ReconciliationDecisionRuleService,
    private readonly reviewItemService: ReviewItemService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs<BackfillReconciliationDecisionRuleOptions>): Promise<void> {
    const approvedItems = await this.fetchApprovedReviewItems(workspaceId);
    const carrierNameByReconciliationId =
      await this.buildCarrierNameCacheByReconciliationId(
        workspaceId,
        approvedItems,
      );
    const eligibleItemsByCarrierName = new Map<
      string,
      ReviewItemForDecisionRule[]
    >();
    let eligibleCount = 0;
    const uniqueSignatureHashes = new Set<string>();

    for (const item of approvedItems) {
      const carrierName = carrierNameByReconciliationId.get(
        item.reconciliationId,
      );

      if (!carrierName) {
        continue;
      }

      const signatureResult = this.decisionRuleService.buildStatusRuleSignature(
        item,
        carrierName,
      );

      if (!signatureResult) {
        continue;
      }

      eligibleCount += 1;
      uniqueSignatureHashes.add(signatureResult.signatureHash);

      const carrierItems = eligibleItemsByCarrierName.get(carrierName) ?? [];

      carrierItems.push(item);
      eligibleItemsByCarrierName.set(carrierName, carrierItems);
    }

    this.logger.log(
      `Found ${eligibleCount} approved status review item(s), yielding ${uniqueSignatureHashes.size} unique learned rule signature(s) in workspace ${workspaceId}`,
    );

    if (options.dryRun) {
      if (options.applyToReconciliationId) {
        this.logger.log(
          `[DRY RUN] would auto-apply learned rules to reconciliation ${options.applyToReconciliationId}`,
        );
      }

      return;
    }

    let learnedRules = 0;

    for (const [carrierName, items] of eligibleItemsByCarrierName) {
      const rules = await this.decisionRuleService.upsertRulesFromReviewItems({
        workspaceId,
        carrierName,
        items,
        createdByUserWorkspaceId: null,
      });

      learnedRules += rules.length;
    }

    this.logger.log(
      `Backfilled/refreshed ${learnedRules} reconciliation decision rule observation(s) in workspace ${workspaceId}`,
    );

    if (options.applyToReconciliationId) {
      const applyResult =
        await this.reviewItemService.applyLearnedRulesForReconciliation(
          workspaceId,
          options.applyToReconciliationId,
        );

      this.logger.log(
        `Auto-applied ${applyResult.updatedCount} pending review item(s) and skipped ${applyResult.skippedCount} in reconciliation ${options.applyToReconciliationId}`,
      );
    }
  }

  // Learning from the rule engine's own approvals would reinforce itself and
  // resurrect rules a human deactivated (audit 1.7). A null decisionSource
  // predates the column, so a human decided it.
  static isHumanApprovedReviewItem(item: ReviewItemForDecisionRule): boolean {
    if (isDefined(item.autoAppliedAt)) {
      return false;
    }

    return (
      item.decisionSource === 'USER' ||
      item.decisionSource === 'BATCH_USER' ||
      item.decisionSource == null
    );
  }

  private async fetchApprovedReviewItems(
    workspaceId: string,
  ): Promise<ReviewItemForDecisionRule[]> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      // operator backfill over every run's review items, no requesting user
      const reviewItemRepo =
        this.workspaceOrmManager.getRepositoryWithoutPermissionChecks<ReviewItemForDecisionRule>(
          'reviewItem',
        );

      const items = await reviewItemRepo.find({
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

      // legacy rows can carry a stale decisionSource next to autoAppliedAt
      return items.filter((item) =>
        BackfillReconciliationDecisionRulesCommand.isHumanApprovedReviewItem(
          item,
        ),
      );
    }, authContext);
  }

  private async buildCarrierNameCacheByReconciliationId(
    workspaceId: string,
    items: ReviewItemForDecisionRule[],
  ): Promise<Map<string, string>> {
    const reconciliationIds = [
      ...new Set(items.map((item) => item.reconciliationId)),
    ];
    const carrierNameByReconciliationId = new Map<string, string>();

    for (const reconciliationId of reconciliationIds) {
      const carrierName =
        await this.decisionRuleService.getCarrierNameForReconciliation(
          workspaceId,
          reconciliationId,
        );

      if (carrierName) {
        carrierNameByReconciliationId.set(reconciliationId, carrierName);
      }
    }

    return carrierNameByReconciliationId;
  }
}
