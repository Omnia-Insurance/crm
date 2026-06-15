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
        take,
        skip,
      }: {
        where: Record<string, unknown>;
        take: number;
        skip: number;
      }) => policies.slice(skip, skip + take),
    ),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn(async () => policyRepo),
  };
  const service = new ReconciliationDataService(
    globalWorkspaceOrmManager as never,
  );

  return { service, policyRepo, globalWorkspaceOrmManager };
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
    const { service, policyRepo } = createService(
      makePolicies(PAGE_SIZE * 3),
    );

    await expect(
      service.fetchPoliciesForMatching(WORKSPACE_ID, CARRIER_ID, {
        maxPolicies: 1_000,
      }),
    ).rejects.toThrow(/exceeds the in-memory matching cap of 1000/);

    // Aborted as soon as the cap was crossed — no further pages fetched.
    expect(policyRepo.find).toHaveBeenCalledTimes(3);
  });

  it('fetches all pages scoped to the carrier and logs corpus stats', async () => {
    const { service, policyRepo } = createService(
      makePolicies(PAGE_SIZE + 50),
    );
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
});
