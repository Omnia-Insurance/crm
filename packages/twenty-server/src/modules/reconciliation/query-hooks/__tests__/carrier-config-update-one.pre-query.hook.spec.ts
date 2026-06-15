// OMNIA-CUSTOM: tests for the carrierConfig rename guard (OMN-11).
// Contract: a `name` change is BLOCKED while reconciliationDecisionRule or
// reviewItem rows reference the old carrierName (the join key everything
// learned hangs off), and allowed otherwise; non-name edits always pass.

import type { UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import type { AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { CarrierConfigUpdateOnePreQueryHook } from 'src/modules/reconciliation/query-hooks/carrier-config-update-one.pre-query.hook';

const CARRIER_CONFIG_ID = 'carrier-config-id';
const OLD_NAME = 'Ambetter';

const buildAuthContext = (): AuthContext =>
  ({
    workspace: { id: 'workspace-id' },
  }) as unknown as AuthContext;

const buildPayload = (data: Record<string, unknown>): UpdateOneResolverArgs =>
  ({ id: CARRIER_CONFIG_ID, data }) as unknown as UpdateOneResolverArgs;

const createHook = ({
  existingConfig = { id: CARRIER_CONFIG_ID, name: OLD_NAME },
  decisionRuleCount = 0,
  reviewItemCount = 0,
}: {
  existingConfig?: Record<string, unknown> | null;
  decisionRuleCount?: number;
  reviewItemCount?: number;
} = {}) => {
  const carrierConfigRepo = {
    findOne: jest.fn(async () => existingConfig),
  };
  const decisionRuleRepo = {
    count: jest.fn(async () => decisionRuleCount),
  };
  const reviewItemRepo = {
    count: jest.fn(async () => reviewItemCount),
  };

  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn(async (_workspaceId: string, objectName: string) => {
      switch (objectName) {
        case 'carrierConfig':
          return carrierConfigRepo;
        case 'reconciliationDecisionRule':
          return decisionRuleRepo;
        case 'reviewItem':
          return reviewItemRepo;
        default:
          throw new Error(`Unexpected repository: ${objectName}`);
      }
    }),
  };

  const hook = new CarrierConfigUpdateOnePreQueryHook(
    globalWorkspaceOrmManager as never,
  );

  return {
    hook,
    carrierConfigRepo,
    decisionRuleRepo,
    reviewItemRepo,
    globalWorkspaceOrmManager,
  };
};

describe('CarrierConfigUpdateOnePreQueryHook (rename guard)', () => {
  it('blocks a rename when learned decision rules reference the old name', async () => {
    const { hook, decisionRuleRepo } = createHook({ decisionRuleCount: 3 });

    await expect(
      hook.execute(
        buildAuthContext(),
        'carrierConfig',
        buildPayload({ name: 'Ambetter (Centene)' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(decisionRuleRepo.count).toHaveBeenCalledWith({
      where: { carrierName: OLD_NAME },
    });
  });

  it('blocks a rename when review items / overrides reference the old name', async () => {
    const { hook, reviewItemRepo } = createHook({ reviewItemCount: 12 });

    await expect(
      hook.execute(
        buildAuthContext(),
        'carrierConfig',
        buildPayload({ name: 'UHO' }),
      ),
    ).rejects.toThrow(/12 review item/);

    expect(reviewItemRepo.count).toHaveBeenCalledWith({
      where: { carrierName: OLD_NAME },
    });
  });

  it('allows a rename when nothing references the old name', async () => {
    const { hook } = createHook();
    const payload = buildPayload({ name: 'Ambetter v2' });

    await expect(
      hook.execute(buildAuthContext(), 'carrierConfig', payload),
    ).resolves.toBe(payload);
  });

  it('passes through edits that do not touch the name field without counting', async () => {
    const { hook, carrierConfigRepo, decisionRuleRepo, reviewItemRepo } =
      createHook({ decisionRuleCount: 99 });
    const payload = buildPayload({
      matchingConfig: { autoMatchThreshold: 90 },
    });

    await expect(
      hook.execute(buildAuthContext(), 'carrierConfig', payload),
    ).resolves.toBe(payload);

    // Narrow guard: a non-name edit must not even read the record.
    expect(carrierConfigRepo.findOne).not.toHaveBeenCalled();
    expect(decisionRuleRepo.count).not.toHaveBeenCalled();
    expect(reviewItemRepo.count).not.toHaveBeenCalled();
  });

  it('passes through a no-op name write (same value) without counting', async () => {
    const { hook, decisionRuleRepo, reviewItemRepo } = createHook({
      decisionRuleCount: 99,
      reviewItemCount: 99,
    });
    const payload = buildPayload({ name: OLD_NAME });

    await expect(
      hook.execute(buildAuthContext(), 'carrierConfig', payload),
    ).resolves.toBe(payload);

    expect(decisionRuleRepo.count).not.toHaveBeenCalled();
    expect(reviewItemRepo.count).not.toHaveBeenCalled();
  });

  it('passes through when the record does not exist (runner handles the 404)', async () => {
    const { hook } = createHook({ existingConfig: null });
    const payload = buildPayload({ name: 'Whatever' });

    await expect(
      hook.execute(buildAuthContext(), 'carrierConfig', payload),
    ).resolves.toBe(payload);
  });

  it('passes through when the auth context has no workspace', async () => {
    const { hook, globalWorkspaceOrmManager } = createHook({
      decisionRuleCount: 99,
    });
    const payload = buildPayload({ name: 'Whatever' });

    await expect(
      hook.execute({} as AuthContext, 'carrierConfig', payload),
    ).resolves.toBe(payload);

    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('includes both counts and the old/new names in the blocking error', async () => {
    const { hook } = createHook({ decisionRuleCount: 2, reviewItemCount: 5 });

    await expect(
      hook.execute(
        buildAuthContext(),
        'carrierConfig',
        buildPayload({ name: 'Renamed' }),
      ),
    ).rejects.toThrow(
      /"Ambetter" → "Renamed".*2 learned decision rule\(s\).*5 review item/,
    );
  });
});
