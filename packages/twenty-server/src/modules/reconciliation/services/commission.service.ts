import { Injectable, Logger } from '@nestjs/common';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { sleep } from 'src/modules/reconciliation/types/reconciliation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommissionConfig = {
  compType: 'pmpm' | 'percentage';
  paymentLagMonths: number;
  defaultRate: number;
  rates: CommissionRate[];
};

export type CommissionRate = {
  state: string;
  product?: string;
  upline?: string;
  rate: number;
};

export type CommissionStatementStats = {
  totalLines: number;
  matched: number;
  unmatched: number;
  totalExpected: number;
  totalReceived: number;
  delta: number;
};

type DeltaStatus = 'CORRECT' | 'UNDERPAID' | 'OVERPAID' | 'UNMATCHED' | 'MISSING';

// ---------------------------------------------------------------------------
// Rate lookup
// ---------------------------------------------------------------------------

/**
 * Look up the commission rate for a policy based on state and optionally product.
 * Falls back through: state+product → state-only → defaultRate.
 */
export const lookupRate = (
  config: CommissionConfig,
  policyState: string | null,
  productName?: string | null,
): number => {
  if (!policyState) return config.defaultRate;

  const normalized = policyState.trim().toUpperCase();

  // Try state + product match
  if (productName) {
    const productMatch = config.rates.find(
      (r) =>
        r.state === normalized &&
        r.product &&
        productName.toLowerCase().includes(r.product.toLowerCase()),
    );

    if (productMatch) return productMatch.rate;
  }

  // State-only match
  const stateMatch = config.rates.find((r) => r.state === normalized && !r.product);

  if (stateMatch) return stateMatch.rate;

  return config.defaultRate;
};

/**
 * Compute delta status from expected and actual amounts.
 */
export const computeDeltaStatus = (
  expected: number,
  actual: number,
  toleranceCents: number = 1,
): DeltaStatus => {
  const diff = Math.abs(expected - actual);

  if (diff <= toleranceCents) return 'CORRECT';
  if (expected > actual) return 'UNDERPAID';

  return 'OVERPAID';
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const BATCH_SIZE = 200;
const BATCH_DELAY_MS = 500;

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async batchCreateLineItems(
    workspaceId: string,
    items: Record<string, unknown>[],
  ): Promise<void> {
    if (items.length === 0) return;

    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'commissionLineItem',
          { shouldBypassPermissionChecks: true },
        );

        const totalBatches = Math.ceil(items.length / BATCH_SIZE);

        for (let i = 0; i < totalBatches; i++) {
          const batch = items.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

          await repo.save(batch);

          this.logger.log(
            `Batch ${i + 1}/${totalBatches}: inserted ${batch.length} commission line items`,
          );

          if (i < totalBatches - 1) {
            await sleep(BATCH_DELAY_MS);
          }
        }
      },
      authContext,
    );

    this.logger.log(`Created ${items.length} commission line items total`);
  }

  async deleteLineItemsByStatement(
    workspaceId: string,
    commissionStatementId: string,
  ): Promise<number> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'commissionLineItem',
          { shouldBypassPermissionChecks: true },
        );

        const result = await repo.delete({
          commissionStatementId,
        } as any);

        return result.affected ?? 0;
      },
      authContext,
    );
  }

  /**
   * Update commission tracking fields on a policy record.
   */
  async updatePolicyCommissionFields(
    workspaceId: string,
    policyId: string,
    data: {
      totalCommissionReceived?: number;
      lastCommissionDate?: string;
      lastCommissionAmount?: number;
      expectedMonthlyCommission?: number;
      consecutiveMissedPayments?: number;
      monthsPaidWhileUnmonitored?: number;
      autoAuditFlag?: boolean;
    },
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'policy',
          { shouldBypassPermissionChecks: true },
        );

        await repo.update({ id: policyId }, data as any);
      },
      authContext,
    );
  }

  /**
   * Scan unmonitored policies for this carrier after processing a commission statement.
   * Policies with "Active - Unmonitored" status that received payment get updated;
   * those that didn't get flagged for audit.
   */
  async checkUnmonitoredPolicies(
    workspaceId: string,
    carrierId: string | null,
    paidPolicyIds: Set<string>,
  ): Promise<{ updated: number; flagged: number }> {
    if (!carrierId) return { updated: 0, flagged: 0 };

    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'policy',
          { shouldBypassPermissionChecks: true },
        );

        const unmonitored = await repo.find({
          where: {
            carrierId,
            status: 'ACTIVE_UNMONITORED',
          } as any,
        });

        let updated = 0;
        let flagged = 0;

        for (const policy of unmonitored) {
          const id = (policy as Record<string, unknown>).id as string;

          if (paidPolicyIds.has(id)) {
            const currentMonths =
              ((policy as Record<string, unknown>).monthsPaidWhileUnmonitored as number) ?? 0;

            await repo.update(
              { id } as any,
              {
                monthsPaidWhileUnmonitored: currentMonths + 1,
                consecutiveMissedPayments: 0,
              } as any,
            );

            updated++;
          } else {
            const currentMissed =
              ((policy as Record<string, unknown>).consecutiveMissedPayments as number) ?? 0;

            await repo.update(
              { id } as any,
              {
                autoAuditFlag: true,
                consecutiveMissedPayments: currentMissed + 1,
              } as any,
            );

            flagged++;
          }
        }

        if (updated + flagged > 0) {
          this.logger.log(
            `Unmonitored policy check: ${updated} updated (paid), ${flagged} flagged (missed)`,
          );
        }

        return { updated, flagged };
      },
      authContext,
    );
  }
}
