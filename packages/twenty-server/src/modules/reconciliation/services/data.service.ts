import { Injectable, Logger } from '@nestjs/common';

import { type EmailsMetadata, type PhonesMetadata } from 'twenty-shared/types';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  normalizeDateOnly,
  type CrmPolicy,
} from 'src/modules/reconciliation/engines/matching';
import type {
  CarrierConfigRecord,
  EnrichedPolicyData,
  ReconciliationRecord,
} from 'src/modules/reconciliation/types/reconciliation';

const PAGE_SIZE = 500;

/**
 * Hard cap on the CRM policy corpus loaded into memory for matching
 * (remediation 4.9). The whole carrier book is held in RAM while the match
 * job runs; past this size the right fix is chunked matching, not a bigger
 * heap — so we fail fast with a clear error instead of OOMing the worker.
 */
export const MAX_POLICIES_FOR_MATCHING = 200_000;

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
    options?: { maxPolicies?: number },
  ): Promise<CrmPolicy[]> {
    // A missing carrierId is a hard error (remediation 4.9): matching would
    // otherwise run against EVERY policy in the workspace, silently
    // mis-matching rows across carriers. The only production caller is the
    // match job, which passes carrierConfig.carrierId — null there means the
    // carrier-config seed could not find the carrier record (it warns about
    // this), a misconfiguration the operator must fix, not a mode we support.
    // The match job's catch routes this to FAILED with the message visible.
    if (!carrierId) {
      throw new Error(
        'fetchPoliciesForMatching requires a carrierId: the carrier config is ' +
          'not linked to a carrier record, and matching without one would ' +
          'compare BOB rows against every policy in the workspace ' +
          '(cross-carrier matching corrupts results). Link the carrier record ' +
          'on the carrier config (carrierConfig.carrierId) and re-run.',
      );
    }

    const maxPolicies = options?.maxPolicies ?? MAX_POLICIES_FOR_MATCHING;
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
        let pages = 0;

        while (hasMore) {
          const where: Record<string, unknown> = { carrierId };

          const batch = await repo.find({
            where,
            take: PAGE_SIZE,
            skip: offset,
            // Deterministic order is required for LIMIT/OFFSET pagination:
            // without it, Postgres gives no ordering guarantee between
            // pages, so concurrent writes (or synchronized seq scans) can
            // skip policies or return them twice across page boundaries.
            order: { id: 'ASC' },
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
              // Normalized to 'YYYY-MM-DD' so DOB matching (Tiers 6/8)
              // compares like-for-like with the BOB side, which the parse
              // transforms already emit as a plain date.
              'lead.dateOfBirth': normalizeDateOnly(
                lead?.dateOfBirth as string | Date | null,
              ),
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

          pages += 1;

          // Scale guard (remediation 4.9): fail fast instead of OOMing the
          // worker when a carrier's book outgrows in-memory matching.
          if (policies.length > maxPolicies) {
            throw new Error(
              `Policy corpus for carrier ${carrierId} exceeds the in-memory ` +
                `matching cap of ${maxPolicies} (fetched ${policies.length} ` +
                `across ${pages} pages). Matching aborted — chunked matching ` +
                'is required for books this size.',
            );
          }

          hasMore = batch.length === PAGE_SIZE;
          offset += PAGE_SIZE;
        }

        // INFO-level corpus stats so operators can see per-run corpus sizes.
        this.logger.log(
          `Fetched ${policies.length} CRM policies for matching ` +
            `(carrierId=${carrierId}, pages=${pages}, pageSize=${PAGE_SIZE})`,
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
