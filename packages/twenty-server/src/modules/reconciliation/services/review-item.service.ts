import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS } from 'twenty-shared/constants';
import { type EmailsMetadata, type PhonesMetadata } from 'twenty-shared/types';
import {
  coerceFieldDiffValueForRecordUpdate,
  isDefined,
  promotePrimaryEmailToAdditional,
  promotePrimaryPhoneToAdditional,
} from 'twenty-shared/utils';
import { In, IsNull, type UpdateResult } from 'typeorm';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/permissions/permissions.exception';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';
import { type PolicyUpdateTarget } from 'src/modules/policy/types/policy-update-target.type';
import { RECONCILIATION_BOOKKEEPING_REPOSITORY_OPTIONS } from 'src/modules/reconciliation/constants/reconciliation-bookkeeping-repository-options.constant';
import {
  type FieldDiffForDecisionRule,
  type ReconciliationDecisionRuleRecord,
  ReconciliationDecisionRuleService,
  type ReconciliationDecisionSource,
  type ReviewItemForDecisionRule,
} from 'src/modules/reconciliation/services/decision-rule.service';
import { planReviewItemReconcile } from 'src/modules/reconciliation/services/review-item-reconcile.util';
import {
  ReconciliationStateMachineService,
  TransitionConflictError,
} from 'src/modules/reconciliation/services/state-machine.service';
import { type ColumnMapping } from 'src/modules/reconciliation/types/reconciliation';

const BATCH_SIZE = 200;

// The reviewItem object is generated per workspace, so there is no shared entity class
type ReviewItem = ReviewItemForDecisionRule & {
  id: string;
  reconciliationId: string;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED' | string;
  decidedAt: string | null;
  category: string | null;
  matchMethod: string | null;
  confidence: number | null;
  policyId: string | null;
  fieldDiffs: FieldDiffForApply[] | null;
  flags: string[] | null;
  bobRowSnapshot: Record<string, unknown> | null;
  // Stamped by match.job at creation; null on items that predate the columns
  carrierPolicyNumber?: string | null;
  carrierName?: string | null;
  cancelPreviousPolicyId?: string | null;
  cancelPriorStatus?: string | null;
  cancelPriorExpirationDate?: string | null;
};

type FieldDiffForApply = FieldDiffForDecisionRule & {
  bobValue: string | null;
  crmValue: string | null;
  crmField: string | null;
  crmObjectType: 'policy' | 'lead' | null;
};

type WorkspaceRecord = Record<string, unknown> & { id: string };

type ReconciliationRecordForApply = {
  id: string;
  columnMapping: ColumnMapping | null;
};

type BatchReviewItemAction = 'APPLY' | 'UNDO';

type BatchReviewItemFilter = {
  minConfidence?: number;
  reviewItemIds?: string[];
};

type BatchApplyOptions = {
  // Every CRM write of the batch and of its learned-rule cascade runs with these permissions
  authContext: WorkspaceAuthContext;
  source?: ReconciliationDecisionSource;
  carrierName?: string | null;
  learnRules?: boolean;
  applySimilar?: boolean;
};

type LearnedRuleApplyOptions = {
  carrierName?: string | null;
  rules?: ReconciliationDecisionRuleRecord[];
  excludeReviewItemIds?: Set<string>;
  // batchApply runs its own completion check once the cascade counts are folded in
  checkCompletion?: boolean;
};

type ReviewItemApplyCandidate = {
  item: ReviewItem;
  decisionRule?: ReconciliationDecisionRuleRecord;
};

type ReviewItemApplyResult = {
  appliedCandidates: ReviewItemApplyCandidate[];
  skippedCount: number;
};

// Matched policies and cancel targets, lead joined, keyed by policy id (remediation 2.6)
type PrefetchedPoliciesById = ReadonlyMap<string, WorkspaceRecord>;

// A permission-checked write that the caller's row-level rules exclude matches no row instead of throwing
const assertWriteReachedRecord = ({ affected }: UpdateResult): void => {
  if (affected === 0) {
    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
  }
};

// An unparsable timestamp falls outside every edit window, so the pre-check fails closed
const toPolicyUpdateTarget = ({
  id,
  createdAt,
}: WorkspaceRecord): PolicyUpdateTarget => {
  if (createdAt instanceof Date) {
    return { id, createdAt: createdAt.toISOString() };
  }

  return { id, createdAt: isNonEmptyString(createdAt) ? createdAt : '' };
};

@Injectable()
export class ReviewItemService {
  private readonly logger = new Logger(ReviewItemService.name);

  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly decisionRuleService: ReconciliationDecisionRuleService,
    private readonly policyWriteAuthorizationService: PolicyWriteAuthorizationService,
    private readonly stateMachine: ReconciliationStateMachineService,
  ) {}

  // Review items are admin-locked reconciliation bookkeeping; every caller is the match
  // job, a CLI command or a RECONCILIATION-gated request
  private getReviewItemRepository(): WorkspaceRepository<ReviewItem> {
    return this.workspaceOrmManager.getRepositoryWithoutPermissionChecks<ReviewItem>(
      'reviewItem',
      RECONCILIATION_BOOKKEEPING_REPOSITORY_OPTIONS,
    );
  }

  // Non-destructive persist for match re-runs (planReviewItemReconcile): decided items stay
  // untouched, and creates and refreshes land before stale deletes in one transaction
  async reconcileMatchResults(
    workspaceId: string,
    reconciliationId: string,
    newItems: Record<string, unknown>[],
    options: { policyNumberHeader?: string | null } = {},
  ): Promise<{
    createdCount: number;
    refreshedCount: number;
    deletedStaleCount: number;
    preservedDecidedCount: number;
    skippedDecidedDuplicateCount: number;
  }> {
    const result = await this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.workspaceOrmManager.runInWorkspaceTransaction(
          async (transactionScope) => {
            // Match-job bookkeeping on the admin-locked reviewItem object
            const reviewItemRepository =
              transactionScope.getRepositoryWithoutPermissionChecks<ReviewItem>(
                'reviewItem',
                RECONCILIATION_BOOKKEEPING_REPOSITORY_OPTIONS,
              );

            const existingItems = await reviewItemRepository.find({
              where: { reconciliationId },
            });

            const plan = planReviewItemReconcile({
              existingItems,
              newItems,
              policyNumberHeader: options.policyNumberHeader ?? null,
            });

            // Chunks bound statement size; an inter-chunk sleep would only hold the locks longer
            for (let i = 0; i < plan.toCreate.length; i += BATCH_SIZE) {
              await reviewItemRepository.insert(
                plan.toCreate.slice(i, i + BATCH_SIZE),
              );
            }

            for (const { id, updates } of plan.toUpdate) {
              await reviewItemRepository.update(id, updates);
            }

            if (plan.toDeleteIds.length > 0) {
              await reviewItemRepository.delete(plan.toDeleteIds);
            }

            return {
              createdCount: plan.toCreate.length,
              refreshedCount: plan.toUpdate.length,
              deletedStaleCount: plan.toDeleteIds.length,
              preservedDecidedCount: plan.preservedDecidedCount,
              skippedDecidedDuplicateCount: plan.skippedDecidedDuplicateCount,
            };
          },
        ),
      buildSystemAuthContext(workspaceId),
    );

    this.logger.log(
      `Reconciled review items for ${reconciliationId}: ${result.createdCount} created, ` +
        `${result.refreshedCount} refreshed, ${result.deletedStaleCount} stale removed, ` +
        `${result.preservedDecidedCount} decided preserved (${result.skippedDecidedDuplicateCount} duplicate(s) skipped)`,
    );

    return result;
  }

  async fetchByReconciliation(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.getReviewItemRepository().find({ where: { reconciliationId } }),
      buildSystemAuthContext(workspaceId),
    );
  }

  // Ambiguity a human should resolve even at high confidence (renewal vs reinstatement,
  // audit-eligible cancels, tie-broken multi-matches); an explicit reviewItemIds list
  // opts in. Shared with the review UI's batch selection (remediation 2.7).
  static readonly BATCH_APPROVE_BLOCKING_FLAGS = [
    ...RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS,
  ] as const;

  async batchApprove(
    workspaceId: string,
    reconciliationId: string,
    filter: BatchReviewItemFilter,
    { authContext }: Pick<BatchApplyOptions, 'authContext'>,
  ): Promise<{ updatedCount: number }> {
    return this.batchApply(workspaceId, reconciliationId, 'APPLY', filter, {
      source: 'BATCH_USER',
      authContext,
    });
  }

  async batchApply(
    workspaceId: string,
    reconciliationId: string,
    action: BatchReviewItemAction,
    filter: BatchReviewItemFilter,
    options: BatchApplyOptions,
  ): Promise<{ updatedCount: number; skippedCount: number }> {
    if (
      filter.reviewItemIds !== undefined &&
      filter.reviewItemIds.length === 0
    ) {
      return { updatedCount: 0, skippedCount: 0 };
    }

    const { authContext } = options;
    const source = options.source ?? this.inferDecisionSource(filter);

    const applyResult =
      await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
        const fieldTypeByCrmField =
          await this.loadFieldTypeByCrmField(reconciliationId);
        const decisionItems = await this.getReviewItemRepository().find({
          where: {
            reconciliationId,
            decision: action === 'APPLY' ? 'PENDING' : 'APPROVED',
          },
        });
        const reviewItemIds =
          filter.reviewItemIds === undefined
            ? null
            : new Set(filter.reviewItemIds);

        return this.applyCandidates({
          authContext,
          action,
          decisionSource: source,
          candidates: decisionItems
            .filter((item) =>
              this.isBatchApplyCandidate(item, action, filter, reviewItemIds),
            )
            .map((item) => ({ item })),
          fieldTypeByCrmField,
        });
      }, authContext);

    const appliedItems = applyResult.appliedCandidates.map(({ item }) => item);
    let updatedCount = appliedItems.length;
    let skippedCount = applyResult.skippedCount;

    this.logger.log(
      `Batch ${action.toLowerCase()} updated ${updatedCount} and skipped ${skippedCount} review items for ${reconciliationId}`,
    );

    if (action === 'APPLY' && (options.learnRules ?? source !== 'AUTO_RULE')) {
      const carrierName =
        options.carrierName ??
        (await this.decisionRuleService.getCarrierNameForReconciliation(
          workspaceId,
          reconciliationId,
        ));
      const rules = await this.decisionRuleService.upsertRulesFromReviewItems({
        workspaceId,
        carrierName,
        items: appliedItems,
        createdByUserWorkspaceId: isUserAuthContext(authContext)
          ? authContext.userWorkspaceId
          : null,
      });

      if (rules.length > 0 && (options.applySimilar ?? true)) {
        // The cascade writes for the same caller, so it gets the same authorization
        const cascadeResult = await this.applyLearnedRules({
          workspaceId,
          reconciliationId,
          authContext,
          carrierName,
          rules,
          excludeReviewItemIds: new Set(appliedItems.map((item) => item.id)),
          checkCompletion: false,
        });

        updatedCount += cascadeResult.updatedCount;
        skippedCount += cascadeResult.skippedCount;
      }
    }

    if (action === 'UNDO' && source !== 'AUTO_RULE') {
      // Each item is the pre-undo record, so its decision provenance is still intact
      for (const item of appliedItems) {
        if (item.decisionSource === 'AUTO_RULE') {
          // Undoing an auto-apply vetoes the rule itself (1.6), so it cannot redo the write
          await this.decisionRuleService.deactivateRuleForUndoneAutoApply({
            workspaceId,
            ruleId: item.decisionRuleId ?? null,
            signatureHash: item.decisionRuleSignatureHash ?? null,
            undoneReviewItemId: item.id,
          });
          continue;
        }

        await this.decisionRuleService.deactivateRuleForSourceReviewItem({
          workspaceId,
          sourceReviewItemId: item.id,
        });
      }
    }

    // UNDO only creates PENDING items, so only an APPLY can complete the run
    if (action === 'APPLY' && updatedCount > 0) {
      await this.completeReconciliationIfFullyDecided(
        workspaceId,
        reconciliationId,
      );
    }

    return { updatedCount, skippedCount };
  }

  // System entry point (match job, decision-rule backfill command): no acting user to authorize
  async applyLearnedRulesForReconciliation(
    workspaceId: string,
    reconciliationId: string,
    options: LearnedRuleApplyOptions = {},
  ): Promise<{ updatedCount: number; skippedCount: number }> {
    return this.applyLearnedRules({
      ...options,
      workspaceId,
      reconciliationId,
      authContext: buildSystemAuthContext(workspaceId),
    });
  }

  private async applyLearnedRules({
    workspaceId,
    reconciliationId,
    authContext,
    carrierName: requestedCarrierName,
    rules,
    excludeReviewItemIds,
    checkCompletion,
  }: LearnedRuleApplyOptions & {
    workspaceId: string;
    reconciliationId: string;
    authContext: WorkspaceAuthContext;
  }): Promise<{ updatedCount: number; skippedCount: number }> {
    const carrierName =
      requestedCarrierName ??
      (await this.decisionRuleService.getCarrierNameForReconciliation(
        workspaceId,
        reconciliationId,
      ));

    if (!carrierName) {
      this.logger.warn(
        `Skipping learned reconciliation rules for ${reconciliationId}: carrier name unavailable`,
      );

      return { updatedCount: 0, skippedCount: 0 };
    }

    const activeRules = (
      rules ??
      (await this.decisionRuleService.findActiveStatusRules(workspaceId))
    ).filter(
      (rule) => rule.isActive !== false && rule.ruleType === 'STATUS_UPDATE',
    );

    if (activeRules.length === 0) {
      return { updatedCount: 0, skippedCount: 0 };
    }

    const rulesBySignatureHash = new Map(
      activeRules.map((rule) => [rule.signatureHash, rule]),
    );
    const excludedIds = excludeReviewItemIds ?? new Set<string>();

    const applyResult =
      await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
        const fieldTypeByCrmField =
          await this.loadFieldTypeByCrmField(reconciliationId);
        const pendingItems = await this.getReviewItemRepository().find({
          where: { reconciliationId, decision: 'PENDING' },
        });
        const candidates: ReviewItemApplyCandidate[] = [];

        for (const item of pendingItems) {
          if (excludedIds.has(item.id)) {
            continue;
          }

          if (item.category === 'UNMATCHED') {
            continue;
          }

          // A PENDING item still carrying a rule signature was vetoed by a user undo (1.6)
          if (isNonEmptyString(item.decisionRuleSignatureHash)) {
            continue;
          }

          // Cancel-bearing items always reach a human (1.5)
          if (this.decisionRuleService.hasCancelAction(item)) {
            continue;
          }

          // Auto-apply only ever writes status (+ expirationDate); mixed items keep their
          // other diffs for human review even when their status signature matches
          if (!this.decisionRuleService.isStatusOnlyReviewItem(item)) {
            continue;
          }

          const signatureResult =
            this.decisionRuleService.buildStatusRuleSignature(
              item,
              carrierName,
            );

          if (!signatureResult) {
            continue;
          }

          const rule = rulesBySignatureHash.get(signatureResult.signatureHash);

          if (!rule || rule.isActive === false) {
            continue;
          }

          candidates.push({ item, decisionRule: rule });
        }

        return this.applyCandidates({
          authContext,
          action: 'APPLY',
          decisionSource: 'AUTO_RULE',
          candidates,
          fieldTypeByCrmField,
        });
      }, authContext);

    const ruleApplyCounts = new Map<string, number>();

    for (const { decisionRule } of applyResult.appliedCandidates) {
      if (!isDefined(decisionRule)) {
        continue;
      }

      ruleApplyCounts.set(
        decisionRule.id,
        (ruleApplyCounts.get(decisionRule.id) ?? 0) + 1,
      );
    }

    for (const [ruleId, count] of ruleApplyCounts) {
      await this.decisionRuleService.recordAutoApplied({
        workspaceId,
        ruleId,
        count,
      });
    }

    const updatedCount = applyResult.appliedCandidates.length;

    if (updatedCount > 0) {
      this.logger.log(
        `Auto-applied ${updatedCount} review item(s) in reconciliation ${reconciliationId} from learned rules`,
      );

      if (checkCompletion ?? true) {
        await this.completeReconciliationIfFullyDecided(
          workspaceId,
          reconciliationId,
        );
      }
    }

    return { updatedCount, skippedCount: applyResult.skippedCount };
  }

  // REVIEW → COMPLETED once no item is PENDING (remediation 3.19). A conflict is benign:
  // another flow completed the run, or it is not in REVIEW yet (auto-apply mid-MATCHING).
  private async completeReconciliationIfFullyDecided(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<void> {
    const pendingCount =
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.getReviewItemRepository().count({
            where: { reconciliationId, decision: 'PENDING' },
          }),
        buildSystemAuthContext(workspaceId),
      );

    if (pendingCount > 0) {
      return;
    }

    try {
      await this.stateMachine.transition(
        workspaceId,
        reconciliationId,
        'REVIEW',
        'COMPLETED',
        { completedAt: new Date().toISOString() },
      );
    } catch (error) {
      if (error instanceof TransitionConflictError) {
        this.logger.log(
          `Skipping REVIEW → COMPLETED for reconciliation ${reconciliationId}: ${error.message}`,
        );

        return;
      }

      throw error;
    }
  }

  // Runs inside the caller's workspace context, one transaction per item
  private async applyCandidates({
    authContext,
    action,
    decisionSource,
    candidates,
    fieldTypeByCrmField,
  }: {
    authContext: WorkspaceAuthContext;
    action: BatchReviewItemAction;
    decisionSource: ReconciliationDecisionSource;
    candidates: ReviewItemApplyCandidate[];
    fieldTypeByCrmField: ReadonlyMap<string, string>;
  }): Promise<ReviewItemApplyResult> {
    const prefetchedPoliciesById = await this.prefetchPoliciesForItems(
      candidates.map(({ item }) => item),
    );

    if (!isDefined(prefetchedPoliciesById)) {
      return { appliedCandidates: [], skippedCount: candidates.length };
    }

    const deniedPolicyIds = await this.findDeniedPolicyIds({
      authContext,
      policies: [...prefetchedPoliciesById.values()],
    });

    const appliedCandidates: ReviewItemApplyCandidate[] = [];
    let skippedCount = 0;

    for (const candidate of candidates) {
      const applied = await this.applyOneReviewItem({
        action,
        item: candidate.item,
        decisionSource,
        decisionRule: candidate.decisionRule,
        fieldTypeByCrmField,
        prefetchedPoliciesById,
        deniedPolicyIds,
      });

      if (applied) {
        appliedCandidates.push(candidate);
      } else {
        skippedCount += 1;
      }
    }

    return { appliedCandidates, skippedCount };
  }

  private async loadFieldTypeByCrmField(
    reconciliationId: string,
  ): Promise<ReadonlyMap<string, string>> {
    // Admin-locked reconciliation bookkeeping, read for its column mapping only
    const reconciliation = await this.workspaceOrmManager
      .getRepositoryWithoutPermissionChecks<ReconciliationRecordForApply>(
        'reconciliation',
      )
      .findOne({ where: { id: reconciliationId } });

    return this.buildFieldTypeByCrmField(reconciliation?.columnMapping ?? null);
  }

  // One IN-query for every matched policy and cancel target, lead joined (2.6). Undefined
  // when the caller may not read them, so the batch skips its items instead of aborting.
  private async prefetchPoliciesForItems(
    items: ReviewItem[],
  ): Promise<PrefetchedPoliciesById | undefined> {
    const policyIds = new Set<string>();

    for (const item of items) {
      if (isNonEmptyString(item.policyId)) {
        policyIds.add(item.policyId);
      }

      const cancelId = this.readCancelTargetId(item);

      if (isNonEmptyString(cancelId)) {
        policyIds.add(cancelId);
      }
    }

    if (policyIds.size === 0) {
      return new Map();
    }

    try {
      // Permission-checked: a user caller only reaches the policies and leads they may read
      const policies = await this.workspaceOrmManager
        .getRepository<WorkspaceRecord>('policy')
        .find({ where: { id: In([...policyIds]) }, relations: ['lead'] });

      return new Map(policies.map((policy) => [policy.id, policy]));
    } catch (error) {
      if (error instanceof PermissionsException) {
        this.logger.warn(
          `Skipping ${items.length} review item(s): their policies are not readable by the caller (${error.message})`,
        );

        return undefined;
      }

      throw error;
    }
  }

  private async findDeniedPolicyIds({
    authContext,
    policies,
  }: {
    authContext: WorkspaceAuthContext;
    policies: WorkspaceRecord[];
  }): Promise<ReadonlySet<string>> {
    if (policies.length === 0) {
      return new Set();
    }

    try {
      const denials =
        await this.policyWriteAuthorizationService.findPolicyUpdateDenials({
          authContext,
          policies: policies.map(toPolicyUpdateTarget),
        });

      return new Set(denials.map(({ policyId }) => policyId));
    } catch (error) {
      // Without principals nothing is authorized: skip every item rather than abort the batch
      this.logger.warn(
        `Policy update pre-check failed (${error instanceof Error ? error.name : 'unknown error'}): skipping the items of ${policies.length} policies`,
      );

      return new Set(policies.map(({ id }) => id));
    }
  }

  private isBatchApplyCandidate(
    item: ReviewItem,
    action: BatchReviewItemAction,
    filter: BatchReviewItemFilter,
    reviewItemIds: Set<string> | null,
  ): boolean {
    if (item.category === 'UNMATCHED') {
      return false;
    }

    if (reviewItemIds !== null) {
      return reviewItemIds.has(item.id);
    }

    if (action === 'UNDO') {
      return true;
    }

    if (
      filter.minConfidence !== undefined &&
      (item.confidence ?? 0) < filter.minConfidence
    ) {
      return false;
    }

    const flags = item.flags ?? [];

    return !flags.some((flag) =>
      ReviewItemService.BATCH_APPROVE_BLOCKING_FLAGS.includes(
        flag as (typeof ReviewItemService.BATCH_APPROVE_BLOCKING_FLAGS)[number],
      ),
    );
  }

  private inferDecisionSource(
    filter: BatchReviewItemFilter,
  ): ReconciliationDecisionSource {
    return filter.reviewItemIds?.length === 1 &&
      filter.minConfidence === undefined
      ? 'USER'
      : 'BATCH_USER';
  }

  private async applyOneReviewItem({
    action,
    item,
    decisionSource,
    decisionRule,
    fieldTypeByCrmField,
    prefetchedPoliciesById,
    deniedPolicyIds,
  }: {
    action: BatchReviewItemAction;
    item: ReviewItem;
    decisionSource: ReconciliationDecisionSource;
    decisionRule?: ReconciliationDecisionRuleRecord;
    fieldTypeByCrmField: ReadonlyMap<string, string>;
    prefetchedPoliciesById: PrefetchedPoliciesById;
    deniedPolicyIds: ReadonlySet<string>;
  }): Promise<boolean> {
    if (!isNonEmptyString(item.policyId)) {
      this.logger.warn(`Skipping review item ${item.id}: no policyId`);

      return false;
    }

    const policy = prefetchedPoliciesById.get(item.policyId);

    if (!isDefined(policy)) {
      this.logger.warn(
        `Skipping review item ${item.id}: policy ${item.policyId} not found`,
      );

      return false;
    }

    // UNDO restores a captured cancel too, with the same same-customer validation as APPLY
    const wantsCancelRestore =
      action === 'UNDO' && isNonEmptyString(item.cancelPriorStatus);
    const cancelTarget =
      action === 'APPLY' || wantsCancelRestore
        ? this.resolveCancelTargetPolicy(item, policy, prefetchedPoliciesById)
        : null;
    const deniedPolicyId = [policy, cancelTarget].find(
      (target) => isDefined(target) && deniedPolicyIds.has(target.id),
    )?.id;

    if (isDefined(deniedPolicyId)) {
      this.logger.warn(
        `Skipping review item ${item.id}: the caller may not update policy ${deniedPolicyId}`,
      );

      return false;
    }

    const lead = (policy.lead as WorkspaceRecord | null | undefined) ?? null;
    const { policyUpdates, leadUpdates } = this.buildUpdatesForTarget({
      target: action === 'APPLY' ? 'bob' : 'crm',
      fieldDiffs: item.fieldDiffs,
      policyRecord: policy,
      leadRecord: lead,
      fieldTypeByCrmField,
    });
    const hasPolicyUpdates = Object.keys(policyUpdates).length > 0;
    const hasLeadUpdates = Object.keys(leadUpdates).length > 0;

    // Composite patches seed from the current lead, so an unreadable lead would lose its values
    if (hasLeadUpdates && !isDefined(lead) && isNonEmptyString(policy.leadId)) {
      this.logger.warn(
        `Skipping review item ${item.id}: lead ${policy.leadId} of policy ${policy.id} is not readable`,
      );

      return false;
    }

    try {
      // The item's CRM writes, cancel capture and decision flip commit together (2.6)
      await this.workspaceOrmManager.runInWorkspaceTransaction(
        async (transactionScope) => {
          // Permission-checked: a user caller's RLS and field permissions bound every CRM write
          const policyRepository =
            transactionScope.getRepository<WorkspaceRecord>('policy');
          const personRepository =
            transactionScope.getRepository<WorkspaceRecord>('person');
          // Admin-locked bookkeeping; the RECONCILIATION flag already gated this caller
          const reviewItemRepository =
            transactionScope.getRepositoryWithoutPermissionChecks<ReviewItem>(
              'reviewItem',
              RECONCILIATION_BOOKKEEPING_REPOSITORY_OPTIONS,
            );

          if (hasPolicyUpdates) {
            assertWriteReachedRecord(
              await policyRepository.update(policy.id, policyUpdates),
            );
          }

          if (hasLeadUpdates && isDefined(lead)) {
            assertWriteReachedRecord(
              await personRepository.update(lead.id, leadUpdates),
            );
          }

          let cancelRestored = false;

          if (action === 'APPLY' && isDefined(cancelTarget)) {
            if (decisionSource === 'AUTO_RULE') {
              // Auto-apply never executes cancels (1.5); candidates exclude them, this is defense in depth
              this.logger.warn(
                `Refusing to cancel previous policy ${cancelTarget.id} for review item ${item.id}: auto-rule applies never execute cancels`,
              );
            } else {
              // Capture the target's prior state before cancelling (1.4); an existing capture is
              // kept, since it came from an UNDO that could not restore the true pre-cancel state
              if (!isNonEmptyString(item.cancelPriorStatus)) {
                await reviewItemRepository.update(item.id, {
                  cancelPriorStatus:
                    (cancelTarget.status as string | null) ?? null,
                  cancelPriorExpirationDate:
                    (cancelTarget.expirationDate as string | null) ?? null,
                });
              }

              await this.cancelPreviousPolicyIfRequested(
                policyRepository,
                item,
                cancelTarget,
              );
            }
          }

          if (wantsCancelRestore && isDefined(cancelTarget)) {
            assertWriteReachedRecord(
              await policyRepository.update(cancelTarget.id, {
                status: item.cancelPriorStatus,
                expirationDate: item.cancelPriorExpirationDate ?? null,
              }),
            );
            cancelRestored = true;
          }

          const decidedAt = new Date().toISOString();
          const reviewItemUpdate: Partial<ReviewItem> = {
            decision: action === 'APPLY' ? 'APPROVED' : 'PENDING',
            decidedAt,
            decisionSource: action === 'APPLY' ? decisionSource : null,
            decisionRuleId: null,
            // UNDO keeps the signature hash as a human-veto marker (1.6); a later APPLY clears
            // it, or re-stamps it when the apply is rule-driven
            decisionRuleSignatureHash:
              action === 'UNDO'
                ? (item.decisionRuleSignatureHash ?? null)
                : null,
            autoAppliedAt: null,
          };

          if (action === 'APPLY' && isDefined(decisionRule)) {
            reviewItemUpdate.decisionRuleId = decisionRule.id;
            reviewItemUpdate.decisionRuleSignatureHash =
              decisionRule.signatureHash;
            reviewItemUpdate.autoAppliedAt = decidedAt;
          }

          // Only a successful restore clears the capture, so an unresolved target can be retried
          if (cancelRestored) {
            reviewItemUpdate.cancelPriorStatus = null;
            reviewItemUpdate.cancelPriorExpirationDate = null;
          }

          await reviewItemRepository.update(item.id, reviewItemUpdate);
        },
      );
    } catch (error) {
      if (
        error instanceof PermissionsException ||
        error instanceof ForbiddenError
      ) {
        this.logger.warn(
          `Skipping review item ${item.id}: a CRM write was denied (${error.message})`,
        );

        return false;
      }

      throw error;
    }

    return true;
  }

  // Server-side mirror of MatchedDiffView.buildUpdatesForTarget: batch apply must behave like
  // clicking Apply all / Undo all on each item, which matters more than loop speed
  private buildUpdatesForTarget({
    target,
    fieldDiffs,
    policyRecord,
    leadRecord,
    fieldTypeByCrmField,
  }: {
    target: 'bob' | 'crm';
    fieldDiffs: FieldDiffForApply[] | null;
    policyRecord: WorkspaceRecord;
    leadRecord: WorkspaceRecord | null;
    fieldTypeByCrmField: ReadonlyMap<string, string>;
  }): {
    policyUpdates: Partial<WorkspaceRecord>;
    leadUpdates: Partial<WorkspaceRecord>;
  } {
    const policyUpdates: Partial<WorkspaceRecord> = {};
    const leadUpdates: Partial<WorkspaceRecord> = {};

    for (const diff of fieldDiffs ?? []) {
      if (!this.isActionableFieldDiff(diff)) {
        continue;
      }

      if (diff.bobValue === diff.crmValue) {
        continue;
      }

      const targetValue = target === 'bob' ? diff.bobValue : diff.crmValue;
      const isLeadField =
        diff.crmObjectType === 'lead' || diff.crmField.startsWith('lead.');
      const crmPath = isLeadField
        ? diff.crmField.replace(/^lead\./, '')
        : diff.crmField;
      const parts = crmPath.split('.');
      const fieldName = parts[0];

      if (!fieldName) {
        continue;
      }

      const updates = isLeadField ? leadUpdates : policyUpdates;
      const sourceRecord = isLeadField ? leadRecord : policyRecord;
      const fieldType =
        fieldTypeByCrmField.get(diff.crmField) ??
        fieldTypeByCrmField.get(crmPath);

      if (parts.length >= 2) {
        const subField = parts[parts.length - 1];

        if (!subField) {
          continue;
        }

        const currentComposite = sourceRecord?.[fieldName];
        const currentSubFieldValue =
          currentComposite !== null &&
          currentComposite !== undefined &&
          typeof currentComposite === 'object'
            ? (currentComposite as Record<string, unknown>)[subField]
            : undefined;
        const seed = this.seedCompositeUpdate(
          updates[fieldName],
          currentComposite,
        );
        const coercedTargetValue = coerceFieldDiffValueForRecordUpdate(
          targetValue,
          {
            fieldType,
            currentValue: currentSubFieldValue,
          },
        );

        if (
          target === 'bob' &&
          targetValue !== null &&
          fieldName === 'phones' &&
          subField === 'primaryPhoneNumber'
        ) {
          updates[fieldName] = promotePrimaryPhoneToAdditional(
            seed as PhonesMetadata,
            targetValue,
          );
        } else if (
          target === 'bob' &&
          targetValue !== null &&
          fieldName === 'emails' &&
          subField === 'primaryEmail'
        ) {
          updates[fieldName] = promotePrimaryEmailToAdditional(
            seed as EmailsMetadata,
            targetValue,
          );
        } else {
          seed[subField] = coercedTargetValue;
          updates[fieldName] = seed;
        }
      } else {
        updates[fieldName] = coerceFieldDiffValueForRecordUpdate(targetValue, {
          fieldType,
          currentValue: sourceRecord?.[fieldName],
        });
      }
    }

    return { policyUpdates, leadUpdates };
  }

  private buildFieldTypeByCrmField(
    columnMapping: ColumnMapping | null,
  ): ReadonlyMap<string, string> {
    const fieldTypeByCrmField = new Map<string, string>();

    for (const entry of Object.values(columnMapping ?? {})) {
      if (!entry.crmField || !entry.fieldType) {
        continue;
      }

      fieldTypeByCrmField.set(entry.crmField, entry.fieldType);

      if (entry.crmField.startsWith('lead.')) {
        fieldTypeByCrmField.set(
          entry.crmField.replace(/^lead\./, ''),
          entry.fieldType,
        );
      }
    }

    return fieldTypeByCrmField;
  }

  private isActionableFieldDiff(
    diff: FieldDiffForApply | null | undefined,
  ): diff is FieldDiffForApply & { crmField: string } {
    return (
      diff !== null &&
      diff !== undefined &&
      // The server is authoritative (remediation 2.1): an INFO_ONLY diff is never written,
      // even with a crmField (engines/diff.ts contract)
      diff.action !== 'INFO_ONLY' &&
      typeof diff.crmField === 'string' &&
      diff.crmField.length > 0
    );
  }

  private seedCompositeUpdate(
    existingUpdate: unknown,
    currentComposite: unknown,
  ): Record<string, unknown> {
    if (existingUpdate && typeof existingUpdate === 'object') {
      return existingUpdate as Record<string, unknown>;
    }

    if (!currentComposite || typeof currentComposite !== 'object') {
      return {};
    }

    const cloned = JSON.parse(JSON.stringify(currentComposite)) as Record<
      string,
      unknown
    >;

    delete cloned.__typename;

    return cloned;
  }

  // The target must provably belong to the matched policy's customer: same leadId, or, when
  // either leadId is missing, same carrier and policy number. An invalid target only skips the cancel.
  private resolveCancelTargetPolicy(
    item: ReviewItem,
    matchedPolicy: WorkspaceRecord,
    prefetchedPoliciesById: PrefetchedPoliciesById,
  ): WorkspaceRecord | null {
    const cancelId = this.readCancelTargetId(item);

    if (!isNonEmptyString(cancelId) || cancelId === item.policyId) {
      return null;
    }

    const cancelTarget = prefetchedPoliciesById.get(cancelId);

    if (!isDefined(cancelTarget)) {
      this.logger.warn(
        `Skipping cancel of previous policy for review item ${item.id}: policy ${cancelId} not found`,
      );

      return null;
    }

    if (!this.isCancelTargetForSameCustomer(matchedPolicy, cancelTarget)) {
      this.logger.warn(
        `Skipping cancel of previous policy for review item ${item.id}: policy ${cancelId} does not belong to the same customer as matched policy ${item.policyId}`,
      );

      return null;
    }

    return cancelTarget;
  }

  private isCancelTargetForSameCustomer(
    matchedPolicy: WorkspaceRecord,
    cancelTarget: WorkspaceRecord,
  ): boolean {
    const matchedLeadId = isNonEmptyString(matchedPolicy.leadId)
      ? matchedPolicy.leadId
      : (matchedPolicy.lead as WorkspaceRecord | null | undefined)?.id;
    const targetLeadId = cancelTarget.leadId;

    if (isNonEmptyString(matchedLeadId) && isNonEmptyString(targetLeadId)) {
      return matchedLeadId === targetLeadId;
    }

    const matchedPolicyNumber = this.normalizePolicyNumber(
      matchedPolicy.policyNumber,
    );
    const targetPolicyNumber = this.normalizePolicyNumber(
      cancelTarget.policyNumber,
    );

    return (
      isNonEmptyString(matchedPolicy.carrierId) &&
      matchedPolicy.carrierId === cancelTarget.carrierId &&
      isNonEmptyString(matchedPolicyNumber) &&
      matchedPolicyNumber === targetPolicyNumber
    );
  }

  private normalizePolicyNumber(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toUpperCase();

    return normalized.length > 0 ? normalized : null;
  }

  // The cancelPreviousPolicyId column (stamped by match.job), else the legacy
  // __cancelPreviousPolicyId snapshot stamp for items that predate it
  private readCancelTargetId(item: ReviewItem): string | null {
    if (isNonEmptyString(item.cancelPreviousPolicyId)) {
      return item.cancelPreviousPolicyId;
    }

    const snapshot = item.bobRowSnapshot as
      | (Record<string, unknown> & {
          __cancelPreviousPolicyId?: string;
        })
      | null;

    return snapshot?.__cancelPreviousPolicyId ?? null;
  }

  private async cancelPreviousPolicyIfRequested(
    policyRepository: WorkspaceRepository<WorkspaceRecord>,
    item: ReviewItem,
    cancelTarget: WorkspaceRecord,
  ): Promise<void> {
    const snapshot = item.bobRowSnapshot as
      | (Record<string, unknown> & {
          __cancelExpireDate?: string | null;
        })
      | null;

    assertWriteReachedRecord(
      await policyRepository.update(cancelTarget.id, {
        status: 'CANCELED',
        expirationDate: snapshot?.__cancelExpireDate ?? null,
      }),
    );
  }

  async fetchOverrides(
    workspaceId: string,
    carrierName: string,
  ): Promise<
    { policyNumber: string; crmPolicyId: string; carrierName: string }[]
  > {
    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      // Approved matches from earlier runs Tier-1 auto-match later runs of the same carrier
      // only; null-carrier items predate the column and fall back to snapshot keys
      const overrideShapes = [
        { decision: 'APPROVED', category: 'UNMATCHED' },
        { decision: 'APPROVED', matchMethod: 'POLICY_NUMBER_MULTI_BEST' },
      ];
      const items = await this.getReviewItemRepository().find({
        where: overrideShapes.flatMap((shape) => [
          { ...shape, carrierName },
          { ...shape, carrierName: IsNull() },
        ]),
      });

      const overrides: {
        policyNumber: string;
        crmPolicyId: string;
        carrierName: string;
      }[] = [];

      for (const item of items) {
        if (!item.policyId) {
          continue;
        }

        const policyNumber = isNonEmptyString(item.carrierPolicyNumber)
          ? item.carrierPolicyNumber
          : this.readLegacySnapshotPolicyNumber(item.bobRowSnapshot);

        if (isNonEmptyString(policyNumber)) {
          overrides.push({
            policyNumber,
            crmPolicyId: item.policyId,
            carrierName: item.carrierName ?? carrierName,
          });
        }
      }

      this.logger.log(
        `Found ${overrides.length} match overrides from previous runs`,
      );

      return overrides;
    }, buildSystemAuthContext(workspaceId));
  }

  // Items that predate the carrierPolicyNumber column keep raw XLSX headers in their
  // snapshot; title case is the canonical Ambetter export header
  private readLegacySnapshotPolicyNumber(
    snapshot: Record<string, unknown> | null,
  ): string | null {
    if (!snapshot) {
      return null;
    }

    const candidate =
      snapshot['Policy Number'] ??
      snapshot.policy_number ??
      snapshot.Policy_Number;

    return typeof candidate === 'string' && candidate.length > 0
      ? candidate
      : null;
  }

  async fetchApproved(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.getReviewItemRepository().find({
          where: { reconciliationId, decision: 'APPROVED' },
        }),
      buildSystemAuthContext(workspaceId),
    );
  }
}
