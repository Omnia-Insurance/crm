import { FindOperator, In } from 'typeorm';

import {
  MAX_POLICIES_FOR_MATCHING,
  ReconciliationDataService,
} from 'src/modules/reconciliation/services/data.service';

const WORKSPACE_ID = 'workspace-id';
const CARRIER_ID = 'carrier-id';

const PAGE_SIZE = 500;

const makePolicies = (count: number): Record<string, unknown>[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `policy-${index}`,
    policyNumber: `U${index}`,
    carrierId: CARRIER_ID,
    lead: null,
    agent: null,
    premium: null,
  }));

const createService = (policies: Record<string, unknown>[]) => {
  const policyRepo = {
    find: jest.fn(
      async ({
        where,
        take,
        skip = 0,
      }: {
        where: Record<string, unknown>;
        take?: number;
        skip?: number;
      }) => {
        if (where.id instanceof FindOperator) {
          const ids = where.id.value as string[];

          return policies.filter((policy) => ids.includes(policy.id as string));
        }

        return policies.slice(skip, skip + (take ?? policies.length));
      },
    ),
    findOne: jest.fn(
      async ({ where }: { where: { id: string } }) =>
        policies.find((policy) => policy.id === where.id) ?? null,
    ),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn(),
    getRepositoryWithoutPermissionChecks: jest.fn(() => policyRepo),
  };
  const service = new ReconciliationDataService(workspaceOrmManager as never);

  return { service, policyRepo, workspaceOrmManager };
};

describe('ReconciliationDataService.fetchPoliciesForMatching', () => {
  it('exposes a 200k default cap', () => {
    expect(MAX_POLICIES_FOR_MATCHING).toBe(200_000);
  });

  it('throws on a null carrierId without touching the repository', async () => {
    const { service, policyRepo } = createService(makePolicies(2));

    await expect(
      service.fetchPoliciesForMatching(WORKSPACE_ID, null),
    ).rejects.toThrow(/requires a carrierId/);
    await expect(
      service.fetchPoliciesForMatching(WORKSPACE_ID, undefined),
    ).rejects.toThrow(/cross-carrier matching corrupts results/);

    expect(policyRepo.find).not.toHaveBeenCalled();
  });

  it('throws when the corpus exceeds the cap instead of loading it all', async () => {
    // 3 full pages; cap of 1000 is crossed when page 3 lands.
    const { service, policyRepo } = createService(makePolicies(PAGE_SIZE * 3));

    await expect(
      service.fetchPoliciesForMatching(WORKSPACE_ID, CARRIER_ID, {
        maxPolicies: 1_000,
      }),
    ).rejects.toThrow(/exceeds the in-memory matching cap of 1000/);

    // Aborted as soon as the cap was crossed — no further pages fetched.
    expect(policyRepo.find).toHaveBeenCalledTimes(3);
  });

  it('fetches all pages scoped to the carrier and logs corpus stats', async () => {
    const { service, policyRepo } = createService(makePolicies(PAGE_SIZE + 50));
    const logSpy = jest
      .spyOn(service['logger'], 'log')
      .mockImplementation(() => undefined);

    const result = await service.fetchPoliciesForMatching(
      WORKSPACE_ID,
      CARRIER_ID,
    );

    expect(result).toHaveLength(PAGE_SIZE + 50);
    expect(result[0]).toMatchObject({
      id: 'policy-0',
      policyNumber: 'U0',
    });

    // Every page is filtered by carrierId — never match-everything.
    for (const call of policyRepo.find.mock.calls) {
      expect(call[0].where).toEqual({ carrierId: CARRIER_ID });
    }

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Fetched ${PAGE_SIZE + 50} CRM policies for matching`,
      ),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`carrierId=${CARRIER_ID}, pages=2`),
    );
  });

  it('reads the corpus through a system repository, never a permission-checked one', async () => {
    const { service, workspaceOrmManager } = createService(makePolicies(1));

    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    await service.fetchPoliciesForMatching(WORKSPACE_ID, CARRIER_ID);

    expect(
      workspaceOrmManager.getRepositoryWithoutPermissionChecks,
    ).toHaveBeenCalledWith('policy');
    expect(workspaceOrmManager.getRepository).not.toHaveBeenCalled();
    expect(workspaceOrmManager.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        type: 'system',
        workspace: { id: WORKSPACE_ID },
      }),
    );
  });

  it('ignores soft-deleted leads and agents like the v2.19 joins did', async () => {
    const { service } = createService([
      {
        id: 'policy-0',
        policyNumber: 'U0',
        carrierId: CARRIER_ID,
        premium: null,
        lead: {
          id: 'lead-0',
          name: { firstName: 'Trashed', lastName: 'Lead' },
          deletedAt: '2026-01-01T00:00:00.000Z',
        },
        agent: {
          id: 'agent-0',
          name: 'Trashed Agent',
          deletedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      {
        id: 'policy-1',
        policyNumber: 'U1',
        carrierId: CARRIER_ID,
        premium: null,
        lead: {
          id: 'lead-1',
          name: { firstName: 'Live', lastName: 'Lead' },
          deletedAt: null,
        },
        agent: { id: 'agent-1', name: 'Live Agent', deletedAt: null },
      },
    ]);

    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    const [trashed, live] = await service.fetchPoliciesForMatching(
      WORKSPACE_ID,
      CARRIER_ID,
    );

    expect(trashed).toMatchObject({
      'lead.name.firstName': null,
      'agent.name': null,
    });
    expect(live).toMatchObject({
      'lead.name.firstName': 'Live',
      'agent.name': 'Live Agent',
    });
  });
});

describe('ReconciliationDataService.enrichMatchedPolicies', () => {
  it('loads the lead relation in batches of 50 and maps the enrichment fields', async () => {
    const policies = Array.from({ length: 51 }, (_, index) => ({
      id: `policy-${index}`,
      planIdentifier: `plan-${index}`,
      lead: {
        id: `lead-${index}`,
        deletedAt: null,
        phones: { primaryPhoneNumber: `555000${index}` },
        emails: { primaryEmail: `lead${index}@example.com` },
      },
    }));
    const { service, policyRepo } = createService(policies);

    const enriched = await service.enrichMatchedPolicies(
      WORKSPACE_ID,
      policies.map((policy) => policy.id),
    );

    expect(policyRepo.find).toHaveBeenCalledTimes(2);
    expect(policyRepo.find).toHaveBeenNthCalledWith(1, {
      where: { id: In(policies.slice(0, 50).map((policy) => policy.id)) },
      relations: ['lead'],
    });
    expect(enriched.size).toBe(51);
    expect(enriched.get('policy-50')).toEqual({
      id: 'policy-50',
      planIdentifier: 'plan-50',
      'lead.id': 'lead-50',
      'lead.phones.primaryPhoneNumber': '55500050',
      'lead.emails.primaryEmail': 'lead50@example.com',
    });
  });

  it('leaves the lead fields empty when the lead is soft-deleted', async () => {
    const policies = [
      {
        id: 'policy-0',
        planIdentifier: null,
        lead: {
          id: 'lead-0',
          deletedAt: '2026-01-01T00:00:00.000Z',
          phones: { primaryPhoneNumber: '5550000' },
          emails: { primaryEmail: 'trashed@example.com' },
        },
      },
    ];
    const { service } = createService(policies);

    const enriched = await service.enrichMatchedPolicies(WORKSPACE_ID, [
      'policy-0',
    ]);

    expect(enriched.get('policy-0')).toEqual({
      id: 'policy-0',
      planIdentifier: null,
      'lead.id': null,
      'lead.phones.primaryPhoneNumber': null,
      'lead.emails.primaryEmail': null,
    });
  });
});

describe('ReconciliationDataService.getLeadIdForPolicy', () => {
  it('returns the lead foreign key without loading the relation', async () => {
    const { service, policyRepo } = createService([
      { id: 'policy-0', leadId: 'lead-0' },
    ]);

    await expect(
      service.getLeadIdForPolicy(WORKSPACE_ID, 'policy-0'),
    ).resolves.toBe('lead-0');
    expect(policyRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'policy-0' },
    });
  });

  it('returns null when the policy has no lead or does not exist', async () => {
    const { service } = createService([{ id: 'policy-0', leadId: null }]);

    await expect(
      service.getLeadIdForPolicy(WORKSPACE_ID, 'policy-0'),
    ).resolves.toBeNull();
    await expect(
      service.getLeadIdForPolicy(WORKSPACE_ID, 'missing-policy'),
    ).resolves.toBeNull();
  });
});
