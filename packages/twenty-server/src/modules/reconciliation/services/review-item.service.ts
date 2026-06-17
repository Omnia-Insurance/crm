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
import { In, IsNull } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import type { WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import type { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import type { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';
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

/**
 * Local typed view of the workspace `reviewItem` entity. Covers the fields
 * this service reads/writes — enough to type the workspace ORM repository
 * generically and eliminate the per-call-site `as any` casts.
 *
 * (The actual entity is generated per-workspace by Twenty's metadata
 * system; there's no shared TS class to import.)
 */
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
  // First-class identity + cancel columns stamped by match.job at creation.
  // Null on legacy items created before the columns existed.
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
  source?: ReconciliationDecisionSource;
  userWorkspaceId?: string | null;
  workspaceMemberId?: string | null;
  carrierName?: string | null;
  learnRules?: boolean;
  applySimilar?: boolean;
};

type ApplyOneOptions = {
  decisionSource: ReconciliationDecisionSource;
  decisionRule?: ReconciliationDecisionRuleRecord | null;
};

/**
 * Policies (with their lead relation joined) prefetched in one IN-query
 * before a batch loop, keyed by policy id (remediation 2.6). Includes both
 * the matched policies and any cancel-previous-policy targets.
 */
type PrefetchedPoliciesById = ReadonlyMap<string, WorkspaceRecord>;

type ActingUserContext = {
  userWorkspaceId: string;
  workspaceMemberId: string | null;
};

@Injectable()
export class ReviewItemService {
  private readonly logger = new Logger(ReviewItemService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly decisionRuleService: ReconciliationDecisionRuleService,
    private readonly policyWriteAuthorizationService: PolicyWriteAuthorizationService,
    private readonly stateMachine: ReconciliationStateMachineService,
  ) {}

  private async getRepo(
    workspaceId: string,
  ): Promise<WorkspaceRepository<ReviewItem>> {
    return this.globalWorkspaceOrmManager.getRepository<ReviewItem>(
      workspaceId,
      'reviewItem',
      { shouldBypassPermissionChecks: true },
    );
  }

  /**
   * Non-destructive persist for match (re-)runs. Instead of delete-all +
   * recreate — which destroyed APPROVED/SKIPPED decisions, their audit trail,
   * and the override-learning source on every re-run — reconcile the new
   * match output against the persisted items by stable row identity (see
   * buildReviewItemIdentity for the key choice):
   * - decided items are preserved untouched; new duplicates are skipped
   * - PENDING items matching a new item are refreshed in place
   * - PENDING items whose identity disappeared are deleted
   * The whole reconcile runs in one transaction, with creates/updates issued
   * before stale deletes, so a mid-persist failure leaves prior items intact.
   */
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
    const authContext = buildSystemAuthContext(workspaceId);

    const result =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const repo = await this.getRepo(workspaceId);
          const workspaceDataSource =
            await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

          return workspaceDataSource.transaction(async (manager) => {
            const transactionManager = manager as WorkspaceEntityManager;

            const existingItems = await repo.find(
              { where: { reconciliationId } },
              transactionManager,
            );

            const plan = planReviewItemReconcile({
              existingItems,
              newItems,
              policyNumberHeader: options.policyNumberHeader ?? null,
            });

            // Chunked inserts bound statement size; no inter-chunk sleep here —
            // it would only extend how long the transaction holds its locks.
            for (let i = 0; i < plan.toCreate.length; i += BATCH_SIZE) {
              await repo.save(
                plan.toCreate.slice(i, i + BATCH_SIZE),
                undefined,
                transactionManager,
              );
            }

            for (const { id, updates } of plan.toUpdate) {
              await repo.update(
                id,
                updates as QueryDeepPartialEntity<ReviewItem>,
                transactionManager,
              );
            }

            if (plan.toDeleteIds.length > 0) {
              await repo.delete(plan.toDeleteIds, transactionManager);
            }

            return {
              createdCount: plan.toCreate.length,
              refreshedCount: plan.toUpdate.length,
              deletedStaleCount: plan.toDeleteIds.length,
              preservedDecidedCount: plan.preservedDecidedCount,
              skippedDecidedDuplicateCount: plan.skippedDecidedDuplicateCount,
            };
          });
        },
        authContext,
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
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.getRepo(workspaceId);

        return repo.find({ where: { reconciliationId } });
      },
      authContext,
    );
  }

  /**
   * Flags that disqualify an item from the implicit "high-confidence batch
   * approve" path. These represent ambiguity a human should resolve even
   * when raw confidence is high — picking the wrong CRM record on a
   * renewal-vs-reinstatement, an audit-eligible cancel, or a tie-broken
   * multi-match would all be high-impact mistakes to auto-apply.
   *
   * Doesn't apply when the caller passes an explicit `reviewItemIds` list:
   * that's a deliberate opt-in (filtered review, single-row approve).
   *
   * Sourced from twenty-shared so the review UI's batch-candidate selection
   * uses the identical list (remediation 2.7); kept as a named re-export
   * here for existing call sites.
   */
  static readonly BATCH_APPROVE_BLOCKING_FLAGS = [
    ...RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS,
  ] as const;

  async batchApprove(
    workspaceId: string,
    reconciliationId: string,
    filter: BatchReviewItemFilter,
    options?: Pick<BatchApplyOptions, 'userWorkspaceId' | 'workspaceMemberId'>,
  ): Promise<{ updatedCount: number }> {
    return this.batchApply(workspaceId, reconciliationId, 'APPLY', filter, {
      source: 'BATCH_USER',
      userWorkspaceId: options?.userWorkspaceId,
      workspaceMemberId: options?.workspaceMemberId,
    });
  }

  async batchApply(
    workspaceId: string,
    reconciliationId: string,
    action: BatchReviewItemAction,
    filter: BatchReviewItemFilter,
    options: BatchApplyOptions = {},
  ): Promise<{ updatedCount: number; skippedCount: number }> {
    if (
      filter.reviewItemIds !== undefined &&
      filter.reviewItemIds.length === 0
    ) {
      return { updatedCount: 0, skippedCount: 0 };
    }

    const authContext = buildSystemAuthContext(workspaceId);
    const source = options.source ?? this.inferDecisionSource(filter);
    // User-initiated batches re-check the fork's policy write RLS per item;
    // auto-rule applies stay system-level (no acting user to authorize).
    const actingUser: ActingUserContext | null =
      isDefined(options.userWorkspaceId) && source !== 'AUTO_RULE'
        ? {
            userWorkspaceId: options.userWorkspaceId,
            workspaceMemberId: options.workspaceMemberId ?? null,
          }
        : null;

    const applyResult =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const reviewItemRepo = await this.getRepo(workspaceId);
          const policyRepo =
            await this.globalWorkspaceOrmManager.getRepository<WorkspaceRecord>(
              workspaceId,
              'policy',
              { shouldBypassPermissionChecks: true },
            );
          const personRepo =
            await this.globalWorkspaceOrmManager.getRepository<WorkspaceRecord>(
              workspaceId,
              'person',
              { shouldBypassPermissionChecks: true },
            );
          const reconciliationRepo =
            await this.globalWorkspaceOrmManager.getRepository<ReconciliationRecordForApply>(
              workspaceId,
              'reconciliation',
              { shouldBypassPermissionChecks: true },
            );
          const workspaceDataSource =
            await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
          const reconciliation = await reconciliationRepo.findOne({
            where: { id: reconciliationId },
          });
          const fieldTypeByCrmField = this.buildFieldTypeByCrmField(
            reconciliation?.columnMapping ?? null,
          );

          const sourceDecision = action === 'APPLY' ? 'PENDING' : 'APPROVED';
          const allDecisionItems = await reviewItemRepo.find({
            where: { reconciliationId, decision: sourceDecision },
          });
          const reviewItemIds =
            filter.reviewItemIds === undefined
              ? null
              : new Set(filter.reviewItemIds);
          const candidates = allDecisionItems.filter((item) =>
            this.isBatchApplyCandidate(item, action, filter, reviewItemIds),
          );

          // One IN-query for every candidate's policy (+ lead) and cancel
          // target instead of a per-item fetch inside the loop (2.6).
          const prefetchedPoliciesById = await this.prefetchPoliciesForItems(
            policyRepo,
            candidates,
          );

          const appliedItems: ReviewItem[] = [];
          let skippedCount = 0;

          for (const item of candidates) {
            const applied = await this.applyOneReviewItem({
              workspaceId,
              action,
              item,
              actingUser,
              reviewItemRepo,
              policyRepo,
              personRepo,
              fieldTypeByCrmField,
              workspaceDataSource,
              prefetchedPoliciesById,
              options: { decisionSource: source },
            });

            if (applied) {
              appliedItems.push(item);
            } else {
              skippedCount += 1;
            }
          }

          this.logger.log(
            `Batch ${action.toLowerCase()} updated ${appliedItems.length} review items for ${reconciliationId}`,
          );

          return { appliedItems, skippedCount };
        },
        authContext,
      );

    let updatedCount = applyResult.appliedItems.length;
    let skippedCount = applyResult.skippedCount;

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
        items: applyResult.appliedItems,
        createdByUserWorkspaceId: options.userWorkspaceId,
      });

      if (rules.length > 0 && (options.applySimilar ?? true)) {
        const autoApplyResult = await this.applyLearnedRulesForReconciliation(
          workspaceId,
          reconciliationId,
          {
            carrierName,
            rules,
            excludeReviewItemIds: new Set(
              applyResult.appliedItems.map((item) => item.id),
            ),
            // batchApply runs its own completion check below, after the
            // cascade's counts are folded in.
            checkCompletion: false,
          },
        );

        updatedCount += autoApplyResult.updatedCount;
        skippedCount += autoApplyResult.skippedCount;
      }
    }

    if (action === 'UNDO' && source !== 'AUTO_RULE') {
      for (const item of applyResult.appliedItems) {
        // `item` is the pre-undo record, so decisionSource/decisionRuleId
        // still reflect how the decision was made.
        if (item.decisionSource === 'AUTO_RULE') {
          // Undoing an auto-applied item is a human veto of the rule itself
          // (1.6): deactivate the rule that applied it so the next
          // applyLearnedRulesForReconciliation pass cannot redo the write
          // the user just reverted.
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

    // Terminal transition wiring: an APPLY that decided the last PENDING
    // item completes the run (REVIEW → COMPLETED). UNDO can only create
    // PENDING items, so it never completes anything.
    if (action === 'APPLY' && updatedCount > 0) {
      await this.completeReconciliationIfFullyDecided(
        workspaceId,
        reconciliationId,
      );
    }

    return { updatedCount, skippedCount };
  }

  async applyLearnedRulesForReconciliation(
    workspaceId: string,
    reconciliationId: string,
    options: {
      carrierName?: string | null;
      rules?: ReconciliationDecisionRuleRecord[];
      excludeReviewItemIds?: Set<string>;
      /**
       * Whether to run the REVIEW → COMPLETED completion check after
       * auto-applying. batchApply passes false because it runs its own
       * check once the cascade's counts are folded in.
       */
      checkCompletion?: boolean;
    } = {},
  ): Promise<{ updatedCount: number; skippedCount: number }> {
    const carrierName =
      options.carrierName ??
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
      options.rules ??
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
    const excludedIds = options.excludeReviewItemIds ?? new Set<string>();
    const ruleApplyCounts = new Map<string, number>();
    const authContext = buildSystemAuthContext(workspaceId);

    const applyResult =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const reviewItemRepo = await this.getRepo(workspaceId);
          const policyRepo =
            await this.globalWorkspaceOrmManager.getRepository<WorkspaceRecord>(
              workspaceId,
              'policy',
              { shouldBypassPermissionChecks: true },
            );
          const personRepo =
            await this.globalWorkspaceOrmManager.getRepository<WorkspaceRecord>(
              workspaceId,
              'person',
              { shouldBypassPermissionChecks: true },
            );
          const reconciliationRepo =
            await this.globalWorkspaceOrmManager.getRepository<ReconciliationRecordForApply>(
              workspaceId,
              'reconciliation',
              { shouldBypassPermissionChecks: true },
            );
          const workspaceDataSource =
            await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
          const reconciliation = await reconciliationRepo.findOne({
            where: { id: reconciliationId },
          });
          const fieldTypeByCrmField = this.buildFieldTypeByCrmField(
            reconciliation?.columnMapping ?? null,
          );
          const pendingItems = await reviewItemRepo.find({
            where: { reconciliationId, decision: 'PENDING' },
          });

          // All eligibility checks are synchronous, so candidates (and the
          // rule each one matches) are resolved up front; their policies are
          // then prefetched in one IN-query instead of per item (2.6).
          const candidates: {
            item: ReviewItem;
            rule: ReconciliationDecisionRuleRecord;
          }[] = [];

          for (const item of pendingItems) {
            if (excludedIds.has(item.id)) continue;
            if (item.category === 'UNMATCHED') continue;
            // Human-veto marker (1.6): a PENDING item that still carries a
            // decisionRuleSignatureHash had a rule-governed decision undone
            // by a user — never auto-apply it again.
            if (isNonEmptyString(item.decisionRuleSignatureHash)) continue;
            // Cancel-bearing items must reach a human unconditionally (1.5).
            // buildStatusRuleSignature also refuses them, but the explicit
            // filter keeps the policy visible at the candidate-selection
            // point too.
            if (this.decisionRuleService.hasCancelAction(item)) continue;
            // Auto-apply is narrower than learning: a status rule may be
            // reinforced by mixed items (status + other field diffs), but
            // auto-apply must only ever write the status (+ companion
            // expirationDate). A mixed pending item keeps its other diffs
            // (paid-through, contact, premium) for human review, so it is never
            // auto-applied even when its status signature matches an active rule.
            if (!this.decisionRuleService.isStatusOnlyReviewItem(item))
              continue;

            const signatureResult =
              this.decisionRuleService.buildStatusRuleSignature(
                item,
                carrierName,
              );

            if (!signatureResult) continue;

            const rule = rulesBySignatureHash.get(
              signatureResult.signatureHash,
            );

            if (!rule || rule.isActive === false) continue;

            candidates.push({ item, rule });
          }

          const prefetchedPoliciesById = await this.prefetchPoliciesForItems(
            policyRepo,
            candidates.map(({ item }) => item),
          );

          let updatedCount = 0;
          let skippedCount = 0;

          for (const { item, rule } of candidates) {
            const applied = await this.applyOneReviewItem({
              workspaceId,
              action: 'APPLY',
              item,
              actingUser: null,
              reviewItemRepo,
              policyRepo,
              personRepo,
              fieldTypeByCrmField,
              workspaceDataSource,
              prefetchedPoliciesById,
              options: {
                decisionSource: 'AUTO_RULE',
                decisionRule: rule,
              },
            });

            if (applied) {
              updatedCount += 1;
              ruleApplyCounts.set(
                rule.id,
                (ruleApplyCounts.get(rule.id) ?? 0) + 1,
              );
            } else {
              skippedCount += 1;
            }
          }

          return { updatedCount, skippedCount };
        },
        authContext,
      );

    for (const [ruleId, count] of ruleApplyCounts) {
      await this.decisionRuleService.recordAutoApplied({
        workspaceId,
        ruleId,
        count,
      });
    }

    if (applyResult.updatedCount > 0) {
      this.logger.log(
        `Auto-applied ${applyResult.updatedCount} review item(s) in reconciliation ${reconciliationId} from learned rules`,
      );

      if (options.checkCompletion ?? true) {
        await this.completeReconciliationIfFullyDecided(
          workspaceId,
          reconciliationId,
        );
      }
    }

    return applyResult;
  }

  /**
   * REVIEW → COMPLETED terminal transition (remediation 3.19 wiring): when a
   * decision flow has just left the reconciliation with zero PENDING review
   * items, complete the run so the UI can show it as finished. The count
   * query runs inside the same flow as the decision writes that triggered
   * it. A TransitionConflictError is a benign no-op: either a concurrent
   * decision flow already completed the run, or the run is not in REVIEW
   * (e.g. learned rules auto-applying mid-MATCHING, before the match job's
   * own MATCHING → REVIEW transition).
   */
  private async completeReconciliationIfFullyDecided(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);
    const pendingCount =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const repo = await this.getRepo(workspaceId);

          return repo.count({
            where: { reconciliationId, decision: 'PENDING' },
          });
        },
        authContext,
      );

    if (pendingCount > 0) return;

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

  /**
   * Single IN-query prefetch of every policy a batch loop will touch —
   * matched policies plus cancel-previous-policy targets — with the lead
   * relation joined, keyed by policy id (2.6). Replaces the per-item
   * query-builder fetch that made batch apply N+1.
   */
  private async prefetchPoliciesForItems(
    policyRepo: WorkspaceRepository<WorkspaceRecord>,
    items: ReviewItem[],
  ): Promise<PrefetchedPoliciesById> {
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

    const policies = await policyRepo.find({
      where: { id: In([...policyIds]) },
      relations: ['lead'],
    });

    return new Map(policies.map((policy) => [policy.id, policy]));
  }

  private isBatchApplyCandidate(
    item: ReviewItem,
    action: BatchReviewItemAction,
    filter: BatchReviewItemFilter,
    reviewItemIds: Set<string> | null,
  ): boolean {
    if (item.category === 'UNMATCHED') return false;

    if (reviewItemIds !== null) {
      return reviewItemIds.has(item.id);
    }

    if (action === 'UNDO') return true;

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
    workspaceId,
    action,
    item,
    actingUser,
    reviewItemRepo,
    policyRepo,
    personRepo,
    fieldTypeByCrmField,
    workspaceDataSource,
    prefetchedPoliciesById,
    options,
  }: {
    workspaceId: string;
    action: BatchReviewItemAction;
    item: ReviewItem;
    actingUser: ActingUserContext | null;
    reviewItemRepo: WorkspaceRepository<ReviewItem>;
    policyRepo: WorkspaceRepository<WorkspaceRecord>;
    personRepo: WorkspaceRepository<WorkspaceRecord>;
    fieldTypeByCrmField: ReadonlyMap<string, string>;
    workspaceDataSource: GlobalWorkspaceDataSource;
    /**
     * Batch callers pass the policies prefetched in one IN-query (2.6);
     * single-item callers may omit it and fall back to a per-item fetch.
     */
    prefetchedPoliciesById?: PrefetchedPoliciesById;
    options: ApplyOneOptions;
  }): Promise<boolean> {
    if (!item.policyId) {
      this.logger.warn(`Skipping review item ${item.id}: no policyId`);

      return false;
    }

    const policy = isDefined(prefetchedPoliciesById)
      ? (prefetchedPoliciesById.get(item.policyId) ?? null)
      : await policyRepo
          .createQueryBuilder('policy')
          .leftJoinAndSelect('policy.lead', 'lead')
          .where('policy.id = :policyId', { policyId: item.policyId })
          .getOne();

    if (!policy) {
      this.logger.warn(
        `Skipping review item ${item.id}: policy ${item.policyId} not found`,
      );

      return false;
    }

    const policyRecord = policy as WorkspaceRecord;
    // UNDO needs the cancel target too when a prior cancel was captured
    // (cancelPriorStatus set at APPLY time) so it can be restored, with the
    // same same-customer validation as the apply path.
    const wantsCancelRestore =
      action === 'UNDO' && isNonEmptyString(item.cancelPriorStatus);
    const cancelTarget =
      action === 'APPLY' || wantsCancelRestore
        ? await this.resolveCancelTargetPolicy(
            policyRepo,
            item,
            policyRecord,
            prefetchedPoliciesById,
          )
        : null;

    if (isDefined(actingUser)) {
      const authorized = await this.actingUserMayWritePolicies({
        workspaceId,
        actingUser,
        item,
        policies: isDefined(cancelTarget)
          ? [policyRecord, cancelTarget]
          : [policyRecord],
      });

      if (!authorized) {
        return false;
      }
    }

    const joinedLead = policyRecord.lead as WorkspaceRecord | null | undefined;
    const leadId = joinedLead?.id;
    const leadRecord = leadId
      ? (joinedLead ??
        ((await personRepo.findOne({
          where: { id: leadId },
        })) as WorkspaceRecord | null))
      : null;
    const target = action === 'APPLY' ? 'bob' : 'crm';
    const { policyUpdates, leadUpdates } = this.buildUpdatesForTarget({
      target,
      fieldDiffs: item.fieldDiffs,
      policyRecord,
      leadRecord,
      fieldTypeByCrmField,
    });

    // All of the item's writes — policy + lead mutations, cancel capture/
    // execute/restore, and the review-item decision flip — commit together
    // (2.6): a mid-item failure can no longer leave the CRM mutated while
    // the item stays PENDING.
    await workspaceDataSource.transaction(async (manager) => {
      const transactionManager = manager as WorkspaceEntityManager;
      const matchedPolicyId = item.policyId as string;

      if (Object.keys(policyUpdates).length > 0) {
        await policyRepo.update(
          matchedPolicyId,
          this.toWorkspaceUpdate(policyUpdates),
          transactionManager,
        );
      }

      if (Object.keys(leadUpdates).length > 0 && leadId) {
        await personRepo.update(
          leadId,
          this.toWorkspaceUpdate(leadUpdates),
          transactionManager,
        );
      }

      let cancelRestored = false;

      if (action === 'APPLY' && isDefined(cancelTarget)) {
        if (options.decisionSource === 'AUTO_RULE') {
          // Approved plan decision (1.5): auto-apply must never execute
          // cancels. Cancel-bearing items are filtered out of the auto-apply
          // candidate pool upstream; this guard is defense in depth in case
          // one slips through (e.g. a legacy item missing its columns).
          this.logger.warn(
            `Refusing to cancel previous policy ${cancelTarget.id} for review item ${item.id}: auto-rule applies never execute cancels`,
          );
        } else {
          // Persist the cancel target's prior {status, expirationDate} on the
          // review item BEFORE mutating the target (1.4) — now in the same
          // transaction, so the capture and the cancel commit or roll back
          // together. Skipped when a prior state is already captured (a
          // previous UNDO could not restore it) — re-capturing here would
          // overwrite the true pre-cancel state with the canceled one.
          if (!isNonEmptyString(item.cancelPriorStatus)) {
            await reviewItemRepo.update(
              item.id,
              {
                cancelPriorStatus:
                  (cancelTarget.status as string | null) ?? null,
                cancelPriorExpirationDate:
                  (cancelTarget.expirationDate as string | null) ?? null,
              } as QueryDeepPartialEntity<ReviewItem>,
              transactionManager,
            );
          }

          await this.cancelPreviousPolicyIfRequested(
            policyRepo,
            item,
            cancelTarget,
            transactionManager,
          );
        }
      }

      if (wantsCancelRestore && isDefined(cancelTarget)) {
        await policyRepo.update(
          cancelTarget.id,
          this.toWorkspaceUpdate({
            status: item.cancelPriorStatus,
            expirationDate: item.cancelPriorExpirationDate ?? null,
          }),
          transactionManager,
        );
        cancelRestored = true;
      }

      const decidedAt = new Date().toISOString();
      const reviewItemUpdate: Partial<ReviewItem> = {
        decision: action === 'APPLY' ? 'APPROVED' : 'PENDING',
        decidedAt,
        decisionSource: action === 'APPLY' ? options.decisionSource : null,
        decisionRuleId: null,
        // UNDO keeps the rule signature hash as a human-veto marker (1.6):
        // decision PENDING + decisionRuleSignatureHash set means a rule-
        // governed decision on this item was explicitly reverted, and
        // applyLearnedRulesForReconciliation must never auto-apply it again.
        // A later manual APPLY clears the marker (or re-stamps it when the
        // apply itself is rule-driven).
        decisionRuleSignatureHash:
          action === 'UNDO' ? (item.decisionRuleSignatureHash ?? null) : null,
        autoAppliedAt: null,
      };

      if (action === 'APPLY' && options.decisionRule) {
        reviewItemUpdate.decisionRuleId = options.decisionRule.id;
        reviewItemUpdate.decisionRuleSignatureHash =
          options.decisionRule.signatureHash;
        reviewItemUpdate.autoAppliedAt = decidedAt;
      }

      if (cancelRestored) {
        // Only a successful restore clears the captured prior state — if the
        // target could not be resolved the capture stays for a later retry.
        reviewItemUpdate.cancelPriorStatus = null;
        reviewItemUpdate.cancelPriorExpirationDate = null;
      }

      await reviewItemRepo.update(
        item.id,
        reviewItemUpdate as QueryDeepPartialEntity<ReviewItem>,
        transactionManager,
      );
    });

    return true;
  }

  /**
   * Server-side mirror of MatchedDiffView.buildUpdatesForTarget. Keeping the
   * write semantics aligned is more important than optimizing this loop:
   * batch apply should behave like clicking the individual Apply all / Undo
   * all button for each review item.
   */
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
      if (!this.isActionableFieldDiff(diff)) continue;
      if (diff.bobValue === diff.crmValue) continue;

      const targetValue = target === 'bob' ? diff.bobValue : diff.crmValue;
      const isLeadField =
        diff.crmObjectType === 'lead' || diff.crmField.startsWith('lead.');
      const crmPath = isLeadField
        ? diff.crmField.replace(/^lead\./, '')
        : diff.crmField;
      const parts = crmPath.split('.');
      const fieldName = parts[0];

      if (!fieldName) continue;

      const updates = isLeadField ? leadUpdates : policyUpdates;
      const sourceRecord = isLeadField ? leadRecord : policyRecord;
      const fieldType =
        fieldTypeByCrmField.get(diff.crmField) ??
        fieldTypeByCrmField.get(crmPath);

      if (parts.length >= 2) {
        const subField = parts[parts.length - 1];

        if (!subField) continue;

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
      if (!entry.crmField || !entry.fieldType) continue;

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

  private toWorkspaceUpdate(
    updates: Partial<WorkspaceRecord>,
  ): QueryDeepPartialEntity<WorkspaceRecord> {
    return updates as QueryDeepPartialEntity<WorkspaceRecord>;
  }

  private isActionableFieldDiff(
    diff: FieldDiffForApply | null | undefined,
  ): diff is FieldDiffForApply & { crmField: string } {
    return (
      diff !== null &&
      diff !== undefined &&
      // The diff engine's contract is that INFO_ONLY diffs are never
      // applied (engines/diff.ts). The frontend used to promote INFO_ONLY
      // to UPDATE when it could backfill a crmField; that promotion was
      // deleted (remediation 2.1) and the server is authoritative: an
      // INFO_ONLY diff is never written, crmField or not.
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

  // Batch apply writes through permission-bypassed repositories, so
  // user-initiated applies must re-check the fork's policy write RLS (agent
  // ownership + edit window). A ForbiddenError skips just that item instead
  // of aborting the whole batch.
  private async actingUserMayWritePolicies({
    workspaceId,
    actingUser,
    item,
    policies,
  }: {
    workspaceId: string;
    actingUser: ActingUserContext;
    item: ReviewItem;
    policies: WorkspaceRecord[];
  }): Promise<boolean> {
    for (const policy of policies) {
      try {
        await this.policyWriteAuthorizationService.assertUserMayWritePolicy({
          workspaceId,
          userWorkspaceId: actingUser.userWorkspaceId,
          workspaceMemberId: actingUser.workspaceMemberId,
          policy: {
            id: policy.id,
            agentId: policy.agentId as string | null | undefined,
            createdAt: policy.createdAt as string | Date | null | undefined,
          },
        });
      } catch (error) {
        if (error instanceof ForbiddenError) {
          this.logger.warn(
            `Skipping review item ${item.id}: user workspace ${actingUser.userWorkspaceId} may not write policy ${policy.id} (${error.message})`,
          );

          return false;
        }

        throw error;
      }
    }

    return true;
  }

  // The cancel target id is read from the first-class cancelPreviousPolicyId
  // column (stamped server-side by match.job), falling back to the legacy
  // __cancelPreviousPolicyId snapshot stamp for items that predate the
  // column. Either way the target must provably belong to the same customer
  // as the matched policy: same leadId, or — when leadId is missing on either
  // side — same carrier and identical normalized policy number. Invalid
  // targets are skipped without failing the item (the item's own apply still
  // proceeds).
  private async resolveCancelTargetPolicy(
    policyRepo: WorkspaceRepository<WorkspaceRecord>,
    item: ReviewItem,
    matchedPolicy: WorkspaceRecord,
    prefetchedPoliciesById?: PrefetchedPoliciesById,
  ): Promise<WorkspaceRecord | null> {
    const cancelId = this.readCancelTargetId(item);

    if (!cancelId || cancelId === item.policyId) return null;

    const cancelTarget =
      prefetchedPoliciesById?.get(cancelId) ??
      ((await policyRepo.findOne({
        where: { id: cancelId },
      })) as WorkspaceRecord | null);

    if (!cancelTarget) {
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
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toUpperCase();

    return normalized.length > 0 ? normalized : null;
  }

  /**
   * The cancel target id from the first-class cancelPreviousPolicyId column
   * (stamped server-side by match.job), falling back to the legacy
   * __cancelPreviousPolicyId snapshot stamp for items that predate it.
   */
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
    policyRepo: WorkspaceRepository<WorkspaceRecord>,
    item: ReviewItem,
    cancelTarget: WorkspaceRecord | null,
    transactionManager?: WorkspaceEntityManager,
  ): Promise<void> {
    if (!isDefined(cancelTarget)) return;

    const snapshot = item.bobRowSnapshot as
      | (Record<string, unknown> & {
          __cancelExpireDate?: string | null;
        })
      | null;

    await policyRepo.update(
      cancelTarget.id,
      this.toWorkspaceUpdate({
        status: 'CANCELED',
        expirationDate: snapshot?.__cancelExpireDate ?? null,
      }),
      transactionManager,
    );
  }

  async fetchOverrides(
    workspaceId: string,
    carrierName: string,
  ): Promise<
    { policyNumber: string; crmPolicyId: string; carrierName: string }[]
  > {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.getRepo(workspaceId);

        // Approved matches from previous runs are human-confirmed overrides
        // that should Tier-1 auto-match in future runs. Scoped to this run's
        // carrier via the first-class carrierName column so carrier A
        // approvals never become overrides for a carrier B run. Items with a
        // null carrierName predate the column (legacy) and are still
        // included — their policy number falls back to snapshot keys below.
        const overrideShapes = [
          { decision: 'APPROVED', category: 'UNMATCHED' },
          { decision: 'APPROVED', matchMethod: 'POLICY_NUMBER_MULTI_BEST' },
        ];
        const items = await repo.find({
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
          if (!item.policyId) continue;

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
      },
      authContext,
    );
  }

  // Legacy fallback for items created before the carrierPolicyNumber column:
  // their snapshots are keyed by raw XLSX headers, so try the known Ambetter
  // header variants (title case is the canonical export format; the old
  // implementation missed it entirely). New items never reach this path.
  private readLegacySnapshotPolicyNumber(
    snapshot: Record<string, unknown> | null,
  ): string | null {
    if (!snapshot) return null;

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
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.getRepo(workspaceId);

        return repo.find({
          where: { reconciliationId, decision: 'APPROVED' },
        });
      },
      authContext,
    );
  }
}
