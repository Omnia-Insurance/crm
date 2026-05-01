import { Injectable, Logger } from '@nestjs/common';

import { type EmailsMetadata, type PhonesMetadata } from 'twenty-shared/types';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import type { CrmPolicy } from 'src/modules/reconciliation/engines/matching';
import type {
  CarrierConfigRecord,
  EnrichedPolicyData,
  ReconciliationRecord,
} from 'src/modules/reconciliation/types/reconciliation';

const PAGE_SIZE = 500;

/**
 * Merge the phase-1 matched policy with phase-2 enrichment into the snapshot
 * the diff engine compares against. Both inputs are already path-keyed
 * (mirroring `ColumnMapping.crmField`), so this is essentially a spread —
 * enriched fields overwrite the nullable phase-1 placeholders.
 */
export const buildPolicyForDiff = (
  matchedPolicy: CrmPolicy,
  enriched: EnrichedPolicyData | null | undefined,
): Record<string, unknown> =>
  enriched ? { ...matchedPolicy, ...enriched } : { ...matchedPolicy };

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

            const addressCustom = lead?.addressCustom as Record<
              string,
              string
            > | null;

            const premium = record.premium as {
              amountMicros?: number | null;
            } | null;

            policies.push({
              id: record.id as string,
              policyNumber: (record.policyNumber as string) ?? null,
              applicationId: (record.applicationId as string) ?? null,
              effectiveDate: (record.effectiveDate as string) ?? null,
              expirationDate: (record.expirationDate as string) ?? null,
              paidThroughDate: (record.paidThroughDate as string) ?? null,
              status: (record.status as string) ?? null,
              applicantCount: (record.applicantCount as number) ?? null,
              'premium.amountMicros': premium?.amountMicros ?? null,
              'lead.name.firstName': name?.firstName ?? null,
              'lead.name.lastName': name?.lastName ?? null,
              'lead.dateOfBirth': (lead?.dateOfBirth as string) ?? null,
              'lead.addressCustom.addressState':
                addressCustom?.addressState ?? null,
              'agent.name': (agent?.name as string) ?? null,
              'agent.npn': (agent?.npn as string) ?? null,
              planIdentifier: null,
              'lead.phones.primaryPhoneNumber': null,
              'lead.emails.primaryEmail': null,
              'lead.id': null,
            });
          }

          hasMore = batch.length === PAGE_SIZE;
          offset += PAGE_SIZE;
        }

        this.logger.log(`Fetched ${policies.length} CRM policies for matching`);

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
              'lead.id': (lead?.id as string) ?? null,
              'lead.phones.primaryPhoneNumber':
                phones?.primaryPhoneNumber ?? null,
              'lead.emails.primaryEmail': emails?.primaryEmail ?? null,
            });
          }
        }

        return enrichedMap;
      },
      authContext,
    );
  }

  /**
   * Fetch the lead's `phones` and `emails` composite values. Used by the
   * Apply orchestrator to seed `promotePrimary*ToAdditional` so we don't
   * silently drop additionalPhones/additionalEmails (or country codes) when
   * patching a primary value.
   */
  async getLeadComposites(
    workspaceId: string,
    leadId: string,
  ): Promise<{
    phones: PhonesMetadata | null;
    emails: EmailsMetadata | null;
  }> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'person',
          { shouldBypassPermissionChecks: true },
        );

        const lead = await repo.findOne({ where: { id: leadId } });

        if (!lead) return { phones: null, emails: null };

        const record = lead as Record<string, unknown>;

        return {
          phones: (record.phones as PhonesMetadata | null | undefined) ?? null,
          emails: (record.emails as EmailsMetadata | null | undefined) ?? null,
        };
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
