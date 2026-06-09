import { Injectable, Logger } from '@nestjs/common';

import { type EmailsMetadata, type PhonesMetadata } from 'twenty-shared/types';
import {
  coerceFieldDiffValueForRecordUpdate,
  promotePrimaryEmailToAdditional,
  promotePrimaryPhoneToAdditional,
} from 'twenty-shared/utils';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import type { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  type FieldDiffForDecisionRule,
  type ReconciliationDecisionRuleRecord,
  ReconciliationDecisionRuleService,
  type ReconciliationDecisionSource,
  RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS,
  type ReviewItemForDecisionRule,
} from 'src/modules/reconciliation/services/decision-rule.service';
import {
  type ColumnMapping,
  sleep,
} from 'src/modules/reconciliation/types/reconciliation';

const BATCH_SIZE = 200;
const BATCH_DELAY_MS = 500;

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
  carrierName?: string | null;
  learnRules?: boolean;
  applySimilar?: boolean;
};

type ApplyOneOptions = {
  decisionSource: ReconciliationDecisionSource;
  decisionRule?: ReconciliationDecisionRuleRecord | null;
};

@Injectable()
export class ReviewItemService {
  private readonly logger = new Logger(ReviewItemService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly decisionRuleService: ReconciliationDecisionRuleService,
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

  async deleteByReconciliation(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<number> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.getRepo(workspaceId);

        const result = await repo.delete({ reconciliationId });

        return result.affected ?? 0;
      },
      authContext,
    );
  }

  async batchCreate(
    workspaceId: string,
    items: Record<string, unknown>[],
  ): Promise<void> {
    if (items.length === 0) return;

    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const repo = await this.getRepo(workspaceId);

      const totalBatches = Math.ceil(items.length / BATCH_SIZE);

      for (let i = 0; i < totalBatches; i++) {
        const batch = items.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

        await repo.save(batch);

        this.logger.log(
          `Batch ${i + 1}/${totalBatches}: inserted ${batch.length} review items`,
        );

        if (i < totalBatches - 1) {
          await sleep(BATCH_DELAY_MS);
        }
      }
    }, authContext);

    this.logger.log(`Created ${items.length} review items total`);
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
   */
  static readonly BATCH_APPROVE_BLOCKING_FLAGS = [
    ...RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS,
  ] as const;

  async batchApprove(
    workspaceId: string,
    reconciliationId: string,
    filter: BatchReviewItemFilter,
    options?: Pick<BatchApplyOptions, 'userWorkspaceId'>,
  ): Promise<{ updatedCount: number }> {
    return this.batchApply(workspaceId, reconciliationId, 'APPLY', filter, {
      source: 'BATCH_USER',
      userWorkspaceId: options?.userWorkspaceId,
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

          const appliedItems: ReviewItem[] = [];
          let skippedCount = 0;

          for (const item of candidates) {
            const applied = await this.applyOneReviewItem({
              action,
              item,
              reviewItemRepo,
              policyRepo,
              personRepo,
              fieldTypeByCrmField,
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
          },
        );

        updatedCount += autoApplyResult.updatedCount;
        skippedCount += autoApplyResult.skippedCount;
      }
    }

    if (action === 'UNDO' && source !== 'AUTO_RULE') {
      for (const item of applyResult.appliedItems) {
        if (item.decisionSource === 'AUTO_RULE') continue;

        await this.decisionRuleService.deactivateRuleForSourceReviewItem({
          workspaceId,
          sourceReviewItemId: item.id,
        });
      }
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
          const reconciliation = await reconciliationRepo.findOne({
            where: { id: reconciliationId },
          });
          const fieldTypeByCrmField = this.buildFieldTypeByCrmField(
            reconciliation?.columnMapping ?? null,
          );
          const pendingItems = await reviewItemRepo.find({
            where: { reconciliationId, decision: 'PENDING' },
          });

          let updatedCount = 0;
          let skippedCount = 0;

          for (const item of pendingItems) {
            if (excludedIds.has(item.id)) continue;
            if (item.category === 'UNMATCHED') continue;

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

            const applied = await this.applyOneReviewItem({
              action: 'APPLY',
              item,
              reviewItemRepo,
              policyRepo,
              personRepo,
              fieldTypeByCrmField,
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
    }

    return applyResult;
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
    action,
    item,
    reviewItemRepo,
    policyRepo,
    personRepo,
    fieldTypeByCrmField,
    options,
  }: {
    action: BatchReviewItemAction;
    item: ReviewItem;
    reviewItemRepo: WorkspaceRepository<ReviewItem>;
    policyRepo: WorkspaceRepository<WorkspaceRecord>;
    personRepo: WorkspaceRepository<WorkspaceRecord>;
    fieldTypeByCrmField: ReadonlyMap<string, string>;
    options: ApplyOneOptions;
  }): Promise<boolean> {
    if (!item.policyId) {
      this.logger.warn(`Skipping review item ${item.id}: no policyId`);

      return false;
    }

    const policy = await policyRepo
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

    if (Object.keys(policyUpdates).length > 0) {
      await policyRepo.update(
        item.policyId,
        this.toWorkspaceUpdate(policyUpdates),
      );
    }

    if (Object.keys(leadUpdates).length > 0 && leadId) {
      await personRepo.update(leadId, this.toWorkspaceUpdate(leadUpdates));
    }

    if (action === 'APPLY') {
      await this.cancelPreviousPolicyIfRequested(policyRepo, item);
    }

    const decidedAt = new Date().toISOString();
    const reviewItemUpdate: Partial<ReviewItem> = {
      decision: action === 'APPLY' ? 'APPROVED' : 'PENDING',
      decidedAt,
      decisionSource: action === 'APPLY' ? options.decisionSource : null,
      decisionRuleId: null,
      decisionRuleSignatureHash: null,
      autoAppliedAt: null,
    };

    if (action === 'APPLY' && options.decisionRule) {
      reviewItemUpdate.decisionRuleId = options.decisionRule.id;
      reviewItemUpdate.decisionRuleSignatureHash =
        options.decisionRule.signatureHash;
      reviewItemUpdate.autoAppliedAt = decidedAt;
    }

    await reviewItemRepo.update(
      item.id,
      reviewItemUpdate as QueryDeepPartialEntity<ReviewItem>,
    );

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

  private async cancelPreviousPolicyIfRequested(
    policyRepo: WorkspaceRepository<WorkspaceRecord>,
    item: ReviewItem,
  ): Promise<void> {
    const snapshot = item.bobRowSnapshot as
      | (Record<string, unknown> & {
          __cancelPreviousPolicyId?: string;
          __cancelExpireDate?: string | null;
        })
      | null;
    const cancelId = snapshot?.__cancelPreviousPolicyId;

    if (!cancelId || cancelId === item.policyId) return;

    await policyRepo.update(
      cancelId,
      this.toWorkspaceUpdate({
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
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.getRepo(workspaceId);

        // Find approved matches from previous runs — these are human-confirmed
        // overrides that should auto-match in future reconciliation runs.
        const items = await repo.find({
          where: [
            { decision: 'APPROVED', category: 'UNMATCHED' },
            { decision: 'APPROVED', matchMethod: 'POLICY_NUMBER_MULTI_BEST' },
          ],
        });

        const overrides: {
          policyNumber: string;
          crmPolicyId: string;
          carrierName: string;
        }[] = [];

        for (const item of items) {
          const snapshot = item.bobRowSnapshot;
          const policyId = item.policyId;

          if (!snapshot || !policyId) continue;

          // Find the policy number from the snapshot
          const policyNumber =
            (snapshot.policy_number as string) ??
            (snapshot.Policy_Number as string) ??
            null;

          if (policyNumber) {
            overrides.push({
              policyNumber,
              crmPolicyId: policyId,
              carrierName,
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
