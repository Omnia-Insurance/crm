import { Injectable, Logger } from '@nestjs/common';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { sleep } from 'src/modules/reconciliation/types/reconciliation';

const BATCH_SIZE = 200;
const BATCH_DELAY_MS = 500;

@Injectable()
export class ReviewItemService {
  private readonly logger = new Logger(ReviewItemService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async deleteByReconciliation(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<number> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'reviewItem',
          { shouldBypassPermissionChecks: true },
        );

        const result = await repo.delete({
          reconciliationId,
        } as any);

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

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'reviewItem',
          { shouldBypassPermissionChecks: true },
        );

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
      },
      authContext,
    );

    this.logger.log(`Created ${items.length} review items total`);
  }

  async fetchByReconciliation(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<Record<string, unknown>[]> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'reviewItem',
          { shouldBypassPermissionChecks: true },
        );

        return repo.find({
          where: { reconciliationId } as any,
        });
      },
      authContext,
    );
  }

  async batchApprove(
    workspaceId: string,
    reconciliationId: string,
    filter: { minConfidence?: number },
  ): Promise<{ updatedCount: number }> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'reviewItem',
          { shouldBypassPermissionChecks: true },
        );

        const qb = repo
          .createQueryBuilder()
          .update()
          .set({
            decision: 'APPROVED',
            decidedAt: new Date().toISOString(),
          } as any)
          .where('"reconciliationId" = :reconciliationId', {
            reconciliationId,
          })
          .andWhere('"decision" = :pending', { pending: 'PENDING' })
          .andWhere('"category" != :unmatched', { unmatched: 'UNMATCHED' });

        if (filter.minConfidence !== undefined) {
          qb.andWhere('"confidence" >= :minConfidence', {
            minConfidence: filter.minConfidence,
          });
        }

        const result = await qb.execute();
        const updatedCount = result.affected ?? 0;

        this.logger.log(
          `Batch approved ${updatedCount} review items for ${reconciliationId}`,
        );

        return { updatedCount };
      },
      authContext,
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
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'reviewItem',
          { shouldBypassPermissionChecks: true },
        );

        // Find approved matches from previous runs — these are human-confirmed
        // overrides that should auto-match in future reconciliation runs.
        const items = await repo.find({
          where: [
            { decision: 'APPROVED', category: 'UNMATCHED' },
            { decision: 'APPROVED', matchMethod: 'POLICY_NUMBER_MULTI_BEST' },
          ] as any,
        });

        const overrides: {
          policyNumber: string;
          crmPolicyId: string;
          carrierName: string;
        }[] = [];

        for (const item of items) {
          const snapshot = (item as Record<string, unknown>)
            .bobRowSnapshot as Record<string, unknown> | null;
          const policyId = (item as Record<string, unknown>).policyId as
            | string
            | null;

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
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'reviewItem',
          { shouldBypassPermissionChecks: true },
        );

        return repo.find({
          where: { reconciliationId, decision: 'APPROVED' } as any,
        });
      },
      authContext,
    );
  }
}
