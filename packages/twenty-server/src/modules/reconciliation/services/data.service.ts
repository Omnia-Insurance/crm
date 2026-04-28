import { Injectable, Logger } from '@nestjs/common';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import type { CrmPolicy } from 'src/modules/reconciliation/engines/matching';
import type {
  CarrierConfigRecord,
  CommissionStatementRecord,
  EnrichedPolicyData,
  ReconciliationRecord,
} from 'src/modules/reconciliation/types/reconciliation';

const PAGE_SIZE = 500;

@Injectable()
export class ReconciliationDataService {
  private readonly logger = new Logger(ReconciliationDataService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async getReconciliation(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<ReconciliationRecord> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'reconciliation',
          { shouldBypassPermissionChecks: true },
        );

        const record = await repo.findOne({
          where: { id: reconciliationId },
        });

        if (!record) {
          throw new Error(
            `Reconciliation ${reconciliationId} not found in workspace ${workspaceId}`,
          );
        }

        return record as unknown as ReconciliationRecord;
      },
      authContext,
    );
  }

  async getCarrierConfig(
    workspaceId: string,
    carrierConfigId: string,
  ): Promise<CarrierConfigRecord> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'carrierConfig',
          { shouldBypassPermissionChecks: true },
        );

        const record = await repo.findOne({
          where: { id: carrierConfigId },
        });

        if (!record) {
          throw new Error(
            `CarrierConfig ${carrierConfigId} not found in workspace ${workspaceId}`,
          );
        }

        return record as unknown as CarrierConfigRecord;
      },
      authContext,
    );
  }

  async getCommissionStatement(
    workspaceId: string,
    statementId: string,
  ): Promise<CommissionStatementRecord> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'commissionStatement',
          { shouldBypassPermissionChecks: true },
        );

        const record = await repo.findOne({
          where: { id: statementId },
        });

        if (!record) {
          throw new Error(
            `CommissionStatement ${statementId} not found in workspace ${workspaceId}`,
          );
        }

        return record as unknown as CommissionStatementRecord;
      },
      authContext,
    );
  }

  async fetchPoliciesForMatching(
    workspaceId: string,
    carrierId?: string | null,
  ): Promise<CrmPolicy[]> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'policy',
          { shouldBypassPermissionChecks: true },
        );

        const policies: CrmPolicy[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const where: Record<string, unknown> = {};

          if (carrierId) {
            where.carrierId = carrierId;
          }

          const batch = await repo.find({
            where,
            take: PAGE_SIZE,
            skip: offset,
            relations: ['lead', 'agent'],
          });

          for (const p of batch) {
            const record = p as Record<string, unknown>;
            const lead = record.lead as Record<string, unknown> | null;
            const agent = record.agent as Record<string, unknown> | null;
            const name = lead?.name as Record<string, string> | null;

            const addressCustom = lead?.addressCustom as
              | Record<string, string>
              | null;

            policies.push({
              id: record.id as string,
              policyNumber: (record.policyNumber as string) ?? null,
              applicationId: (record.applicationId as string) ?? null,
              effectiveDate: (record.effectiveDate as string) ?? null,
              expirationDate: (record.expirationDate as string) ?? null,
              status: (record.status as string) ?? null,
              applicantCount: (record.applicantCount as number) ?? null,
              leadFirstName: name?.firstName ?? null,
              leadLastName: name?.lastName ?? null,
              leadDob: (lead?.dateOfBirth as string) ?? null,
              leadState: addressCustom?.addressState ?? null,
              agentName: (agent?.name as string) ?? null,
              agentNpn: (agent?.npn as string) ?? null,
              planIdentifier: null,
              leadPhone: null,
              leadEmail: null,
              leadId: null,
            });
          }

          hasMore = batch.length === PAGE_SIZE;
          offset += PAGE_SIZE;
        }

        this.logger.log(
          `Fetched ${policies.length} CRM policies for matching`,
        );

        return policies;
      },
      authContext,
    );
  }

  async enrichMatchedPolicies(
    workspaceId: string,
    policyIds: string[],
  ): Promise<Map<string, EnrichedPolicyData>> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'policy',
          { shouldBypassPermissionChecks: true },
        );

        const enrichedMap = new Map<string, EnrichedPolicyData>();
        const ENRICH_BATCH = 50;

        for (let i = 0; i < policyIds.length; i += ENRICH_BATCH) {
          const batchIds = policyIds.slice(i, i + ENRICH_BATCH);

          const results = await repo
            .createQueryBuilder('policy')
            .leftJoinAndSelect('policy.lead', 'lead')
            .where('policy.id IN (:...ids)', { ids: batchIds })
            .getMany();

          for (const p of results) {
            const record = p as Record<string, unknown>;
            const lead = record.lead as Record<string, unknown> | null;
            const phones = lead?.phones as Record<string, string> | null;
            const emails = lead?.emails as Record<string, string> | null;

            enrichedMap.set(record.id as string, {
              id: record.id as string,
              planIdentifier: (record.planIdentifier as string) ?? null,
              leadId: (lead?.id as string) ?? null,
              leadPhone: phones?.primaryPhoneNumber ?? null,
              leadEmail: emails?.primaryEmail ?? null,
            });
          }
        }

        return enrichedMap;
      },
      authContext,
    );
  }

  async getLeadIdForPolicy(
    workspaceId: string,
    policyId: string,
  ): Promise<string | null> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'policy',
          { shouldBypassPermissionChecks: true },
        );

        const policy = await repo.findOne({ where: { id: policyId } });

        if (!policy) return null;

        const record = policy as Record<string, unknown>;
        const lead = record.lead as Record<string, unknown> | null;

        return (lead?.id as string) ?? null;
      },
      authContext,
    );
  }
}
