import { createHash } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import type { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

export type ReconciliationDecisionSource = 'USER' | 'BATCH_USER' | 'AUTO_RULE';

export type FieldDiffForDecisionRule = {
  field?: string | null;
  bobValue: string | null;
  crmValue: string | null;
  crmField: string | null;
  crmObjectType?: 'policy' | 'lead' | null;
  action?: string | null;
  note?: string | null;
};

export type ReviewItemForDecisionRule = {
  id: string;
  reconciliationId: string;
  decision: string;
  category: string | null;
  matchMethod: string | null;
  fieldDiffs: FieldDiffForDecisionRule[] | null;
  flags: string[] | null;
  statusChangeReason?: string | null;
  decisionSource?: ReconciliationDecisionSource | null;
  decisionRuleId?: string | null;
  decisionRuleSignatureHash?: string | null;
  autoAppliedAt?: string | null;
};

export type StatusRuleSignature = {
  ruleVersion: 1;
  ruleType: 'STATUS_UPDATE';
  carrierName: string;
  fromStatus: string;
  toStatus: string;
  matchMethod: string;
  statusReasonClass: string;
  paymentStateBucket: string;
  placementBasis: string;
  expirationDateDiffPresent: boolean;
};

export type StatusRuleSignatureResult = {
  signature: StatusRuleSignature;
  signatureHash: string;
  statusDiff: FieldDiffForDecisionRule;
};

export type ReconciliationDecisionRuleRecord = {
  id: string;
  name: string;
  ruleType: 'STATUS_UPDATE' | string;
  isActive: boolean | null;
  signatureHash: string;
  signature: StatusRuleSignature | Record<string, unknown> | null;
  carrierName: string;
  fromStatus: string;
  toStatus: string;
  sourceReviewItemId: string | null;
  sourceReconciliationId: string | null;
  createdByUserWorkspaceId: string | null;
  approvedCount: number | null;
  autoAppliedCount: number | null;
  lastSeenAt: string | null;
  lastAppliedAt: string | null;
};

type WorkspaceRecord = Record<string, unknown> & { id: string };

export const RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS = [
  'REINSTATEMENT',
  'BROKER_EFF_AUDIT',
  'MULTI_MATCH',
  'NAME_MISMATCH',
] as const;

const STATUS_RULE_ALLOWED_ACTIONABLE_FIELDS = new Set([
  'status',
  'expirationDate',
]);

@Injectable()
export class ReconciliationDecisionRuleService {
  private readonly logger = new Logger(ReconciliationDecisionRuleService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  buildStatusRuleSignature(
    item: ReviewItemForDecisionRule,
    carrierName: string | null | undefined,
  ): StatusRuleSignatureResult | null {
    if (!carrierName) return null;
    if (item.category === 'UNMATCHED') return null;
    if (this.hasAutoRuleBlockingFlag(item)) return null;
    if (!this.isStatusOnlyReviewItem(item)) return null;

    const statusDiff = this.findStatusDiff(item);

    if (!statusDiff?.crmValue || !statusDiff.bobValue) {
      return null;
    }

    const statusReason =
      item.statusChangeReason ?? statusDiff.note ?? undefined;
    const signature: StatusRuleSignature = {
      ruleVersion: 1,
      ruleType: 'STATUS_UPDATE',
      carrierName: this.normalizeCarrierName(carrierName),
      fromStatus: this.normalizeStatus(statusDiff.crmValue),
      toStatus: this.normalizeStatus(statusDiff.bobValue),
      matchMethod: item.matchMethod ?? 'UNKNOWN',
      statusReasonClass: this.classifyStatusReason(statusReason),
      paymentStateBucket: this.derivePaymentStateBucket(
        statusDiff.bobValue,
        statusReason,
      ),
      placementBasis: this.derivePlacementBasis(statusReason),
      expirationDateDiffPresent: this.hasExpirationDateDiff(item),
    };
    const signatureHash = this.hashStableJson(signature);

    return { signature, signatureHash, statusDiff };
  }

  hasAutoRuleBlockingFlag(item: ReviewItemForDecisionRule): boolean {
    const flags = item.flags ?? [];

    return flags.some((flag) =>
      RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS.includes(
        flag as (typeof RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS)[number],
      ),
    );
  }

  async getCarrierNameForReconciliation(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<string | null> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const reconciliationRepo =
          await this.globalWorkspaceOrmManager.getRepository<WorkspaceRecord>(
            workspaceId,
            'reconciliation',
            { shouldBypassPermissionChecks: true },
          );
        const carrierConfigRepo =
          await this.globalWorkspaceOrmManager.getRepository<WorkspaceRecord>(
            workspaceId,
            'carrierConfig',
            { shouldBypassPermissionChecks: true },
          );

        const reconciliation = await reconciliationRepo.findOne({
          where: { id: reconciliationId },
        });
        const carrierConfigId = reconciliation?.carrierConfigId;

        if (typeof carrierConfigId !== 'string') return null;

        const carrierConfig = await carrierConfigRepo.findOne({
          where: { id: carrierConfigId },
        });

        return typeof carrierConfig?.name === 'string'
          ? carrierConfig.name
          : null;
      },
      authContext,
    );
  }

  async findActiveStatusRules(
    workspaceId: string,
  ): Promise<ReconciliationDecisionRuleRecord[]> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const ruleRepo = await this.getRuleRepo(workspaceId);

        return ruleRepo.find({
          where: { ruleType: 'STATUS_UPDATE', isActive: true },
        });
      },
      authContext,
    );
  }

  async upsertRulesFromReviewItems({
    workspaceId,
    carrierName,
    items,
    createdByUserWorkspaceId,
  }: {
    workspaceId: string;
    carrierName: string | null | undefined;
    items: ReviewItemForDecisionRule[];
    createdByUserWorkspaceId?: string | null;
  }): Promise<ReconciliationDecisionRuleRecord[]> {
    if (!carrierName || items.length === 0) return [];

    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const ruleRepo = await this.getRuleRepo(workspaceId);
        const reviewItemRepo =
          await this.globalWorkspaceOrmManager.getRepository<ReviewItemForDecisionRule>(
            workspaceId,
            'reviewItem',
            { shouldBypassPermissionChecks: true },
          );
        const rules: ReconciliationDecisionRuleRecord[] = [];

        for (const item of items) {
          const signatureResult = this.buildStatusRuleSignature(
            item,
            carrierName,
          );

          if (!signatureResult) continue;

          const rule = await this.upsertRule({
            ruleRepo,
            item,
            signatureResult,
            createdByUserWorkspaceId,
          });

          await reviewItemRepo.update(item.id, {
            decisionRuleId: rule.id,
            decisionRuleSignatureHash: rule.signatureHash,
          });

          rules.push(rule);
        }

        if (rules.length > 0) {
          this.logger.log(
            `Learned/refreshed ${rules.length} reconciliation decision rule(s)`,
          );
        }

        return rules;
      },
      authContext,
    );
  }

  async recordAutoApplied({
    workspaceId,
    ruleId,
    count,
  }: {
    workspaceId: string;
    ruleId: string;
    count: number;
  }): Promise<void> {
    if (count <= 0) return;

    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const ruleRepo = await this.getRuleRepo(workspaceId);
      const existing = await ruleRepo.findOne({ where: { id: ruleId } });

      if (!existing) return;

      await ruleRepo.update(ruleId, {
        autoAppliedCount: (existing.autoAppliedCount ?? 0) + count,
        lastAppliedAt: new Date().toISOString(),
      });
    }, authContext);
  }

  async deactivateRuleForSourceReviewItem({
    workspaceId,
    sourceReviewItemId,
  }: {
    workspaceId: string;
    sourceReviewItemId: string;
  }): Promise<number> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const ruleRepo = await this.getRuleRepo(workspaceId);
        const activeSourceRules = await ruleRepo.find({
          where: {
            sourceReviewItemId,
            isActive: true,
          },
        });

        for (const rule of activeSourceRules) {
          await ruleRepo.update(rule.id, {
            isActive: false,
            lastSeenAt: new Date().toISOString(),
          });
        }

        if (activeSourceRules.length > 0) {
          this.logger.warn(
            `Deactivated ${activeSourceRules.length} learned reconciliation rule(s) sourced from undone review item ${sourceReviewItemId}`,
          );
        }

        return activeSourceRules.length;
      },
      authContext,
    );
  }

  private async getRuleRepo(
    workspaceId: string,
  ): Promise<WorkspaceRepository<ReconciliationDecisionRuleRecord>> {
    return this.globalWorkspaceOrmManager.getRepository<ReconciliationDecisionRuleRecord>(
      workspaceId,
      'reconciliationDecisionRule',
      { shouldBypassPermissionChecks: true },
    );
  }

  private async upsertRule({
    ruleRepo,
    item,
    signatureResult,
    createdByUserWorkspaceId,
  }: {
    ruleRepo: WorkspaceRepository<ReconciliationDecisionRuleRecord>;
    item: ReviewItemForDecisionRule;
    signatureResult: StatusRuleSignatureResult;
    createdByUserWorkspaceId?: string | null;
  }): Promise<ReconciliationDecisionRuleRecord> {
    const now = new Date().toISOString();
    const existing = await ruleRepo.findOne({
      where: { signatureHash: signatureResult.signatureHash },
    });

    if (existing) {
      const update = {
        isActive: true,
        signature: signatureResult.signature,
        carrierName: signatureResult.signature.carrierName,
        fromStatus: signatureResult.signature.fromStatus,
        toStatus: signatureResult.signature.toStatus,
        sourceReviewItemId: existing.sourceReviewItemId ?? item.id,
        sourceReconciliationId:
          existing.sourceReconciliationId ?? item.reconciliationId,
        createdByUserWorkspaceId:
          existing.createdByUserWorkspaceId ?? createdByUserWorkspaceId ?? null,
        approvedCount: (existing.approvedCount ?? 0) + 1,
        lastSeenAt: now,
      };

      await ruleRepo.update(existing.id, update);

      return {
        ...existing,
        ...update,
      };
    }

    const rule = await ruleRepo.save({
      name: `${signatureResult.signature.carrierName}: ${signatureResult.signature.fromStatus} -> ${signatureResult.signature.toStatus}`,
      ruleType: 'STATUS_UPDATE',
      isActive: true,
      signatureHash: signatureResult.signatureHash,
      signature: signatureResult.signature,
      carrierName: signatureResult.signature.carrierName,
      fromStatus: signatureResult.signature.fromStatus,
      toStatus: signatureResult.signature.toStatus,
      sourceReviewItemId: item.id,
      sourceReconciliationId: item.reconciliationId,
      createdByUserWorkspaceId: createdByUserWorkspaceId ?? null,
      approvedCount: 1,
      autoAppliedCount: 0,
      lastSeenAt: now,
      lastAppliedAt: null,
    });

    return rule;
  }

  private isStatusOnlyReviewItem(item: ReviewItemForDecisionRule): boolean {
    const actionableDiffs = (item.fieldDiffs ?? []).filter(
      (diff) =>
        diff.crmField !== null &&
        diff.crmField !== undefined &&
        diff.bobValue !== diff.crmValue,
    );

    if (actionableDiffs.length === 0) return false;

    return actionableDiffs.every((diff) =>
      STATUS_RULE_ALLOWED_ACTIONABLE_FIELDS.has(diff.crmField ?? ''),
    );
  }

  private findStatusDiff(
    item: ReviewItemForDecisionRule,
  ): FieldDiffForDecisionRule | null {
    return (
      (item.fieldDiffs ?? []).find(
        (diff) => diff.crmField === 'status' && diff.bobValue !== diff.crmValue,
      ) ?? null
    );
  }

  private hasExpirationDateDiff(item: ReviewItemForDecisionRule): boolean {
    return (item.fieldDiffs ?? []).some(
      (diff) =>
        diff.crmField === 'expirationDate' && diff.bobValue !== diff.crmValue,
    );
  }

  private normalizeCarrierName(value: string): string {
    return value.trim();
  }

  private normalizeStatus(value: string): string {
    return value.trim().toUpperCase();
  }

  private classifyStatusReason(reason: string | null | undefined): string {
    const normalized = this.normalizeReason(reason);

    if (!normalized) return 'NO_REASON';
    if (normalized.includes('not eligible for commission')) {
      return 'NOT_ELIGIBLE_FOR_COMMISSION';
    }
    if (normalized.includes('term date')) return 'TERM_DATE_PAST';
    if (
      normalized.includes('effective date') &&
      normalized.includes('future')
    ) {
      return 'FUTURE_EFFECTIVE_DATE';
    }
    if (normalized.includes('no payment data')) return 'NO_PAYMENT_DATA';
    if (
      normalized.includes('predates effective') &&
      normalized.includes('payment error')
    ) {
      return 'PAID_THROUGH_PREDATES_EFFECTIVE_PAYMENT_ERROR';
    }
    if (normalized.includes('predates effective')) {
      return 'PAID_THROUGH_PREDATES_EFFECTIVE_RECENT';
    }
    if (
      normalized.includes('paid through end of effective month') &&
      normalized.includes('payment current')
    ) {
      return 'FULL_EFFECTIVE_MONTH_PAYMENT_CURRENT';
    }
    if (normalized.includes('paid through end of effective month')) {
      return 'FULL_EFFECTIVE_MONTH_PAYMENT_ERROR';
    }
    if (
      normalized.includes('days between effective and paid-through') &&
      normalized.includes('payment current')
    ) {
      return 'DAYS_THRESHOLD_PAYMENT_CURRENT';
    }
    if (normalized.includes('days between effective and paid-through')) {
      return 'DAYS_THRESHOLD_PAYMENT_ERROR';
    }

    return `UNKNOWN_${this.shortHash(normalized)}`;
  }

  private derivePaymentStateBucket(
    toStatus: string,
    reason: string | null | undefined,
  ): string {
    const normalizedStatus = this.normalizeStatus(toStatus);
    const normalizedReason = this.normalizeReason(reason);

    if (normalizedStatus.includes('PAYMENT_ERROR')) return 'PAYMENT_ERROR';
    if (normalizedReason.includes('payment current')) return 'PAYMENT_CURRENT';
    if (normalizedReason.includes('payment error')) return 'PAYMENT_ERROR';
    if (normalizedStatus.includes('CANCELED')) return 'CANCELED';

    return 'NO_PAYMENT_SIGNAL';
  }

  private derivePlacementBasis(reason: string | null | undefined): string {
    const normalized = this.normalizeReason(reason);

    if (normalized.includes('paid through end of effective month')) {
      return 'PAID_THROUGH_EFFECTIVE_MONTH';
    }
    if (normalized.includes('days between effective and paid-through')) {
      return 'DAYS_BETWEEN_EFFECTIVE_AND_PAID_THROUGH';
    }
    if (normalized.includes('not eligible for commission')) {
      return 'COMMISSION_ELIGIBILITY';
    }
    if (normalized.includes('term date')) return 'TERM_DATE';
    if (normalized.includes('effective date')) return 'EFFECTIVE_DATE';

    return 'NONE';
  }

  private normalizeReason(reason: string | null | undefined): string {
    return (reason ?? '')
      .toLowerCase()
      .replace(/\d{4}-\d{2}-\d{2}/g, '<date>')
      .replace(/\b\d+\b/g, '<number>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hashStableJson(value: unknown): string {
    return createHash('sha256')
      .update(this.stableStringify(value))
      .digest('hex');
  }

  private shortHash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 12);
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;

      return `{${Object.keys(record)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.stableStringify(record[key])}`,
        )
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }
}
