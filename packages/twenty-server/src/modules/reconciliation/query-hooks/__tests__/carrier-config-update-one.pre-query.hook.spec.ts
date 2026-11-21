// OMNIA-CUSTOM: tests for the carrierConfig rename guard (OMN-11).
// Contract: a `name` change is BLOCKED while reconciliationDecisionRule or
// reviewItem rows reference the old carrierName (the join key everything
// learned hangs off), and allowed otherwise; non-name edits always pass.

import type { UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import type { WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { CarrierConfigUpdateOnePreQueryHook } from 'src/modules/reconciliation/query-hooks/carrier-config-update-one.pre-query.hook';

const WORKSPACE_ID = 'workspace-id';
const CARRIER_CONFIG_ID = 'carrier-config-id';
const OLD_NAME = 'Ambetter';

const buildAuthContext = (): WorkspaceAuthContext =>
  ({
    type: 'user',
    workspace: { id: WORKSPACE_ID },
  }) as unknown as WorkspaceAuthContext;

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

  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn((objectName: string) => {
      if (objectName === 'carrierConfig') {
        return carrierConfigRepo;
      }

      throw new Error(
        `Unexpected permission-checked repository: ${objectName}`,
      );
    }),
    getRepositoryWithoutPermissionChecks: jest.fn((objectName: string) => {
      switch (objectName) {
        case 'reconciliationDecisionRule':
          return decisionRuleRepo;
        case 'reviewItem':
          return reviewItemRepo;
        default:
          throw new Error(`Unexpected system repository: ${objectName}`);
      }
    }),
  };

  const hook = new CarrierConfigUpdateOnePreQueryHook(
    workspaceOrmManager as never,
  );

  return {
    hook,
    carrierConfigRepo,
    decisionRuleRepo,
    reviewItemRepo,
    workspaceOrmManager,
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

  it('reads the config as the caller and counts the bookkeeping as the system', async () => {
    const authContext = buildAuthContext();
    const { hook, workspaceOrmManager } = createHook({ reviewItemCount: 1 });

    await expect(
      hook.execute(authContext, 'carrierConfig', buildPayload({ name: 'UHO' })),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenNthCalledWith(1, expect.any(Function), authContext);
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.objectContaining({
        type: 'system',
        workspace: { id: WORKSPACE_ID },
      }),
    );
    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'carrierConfig',
    );
    expect(
      workspaceOrmManager.getRepositoryWithoutPermissionChecks,
    ).not.toHaveBeenCalledWith('carrierConfig');
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

  it('passes through without counting when the record is missing or hidden from the caller', async () => {
    const { hook, decisionRuleRepo } = createHook({
      existingConfig: null,
      decisionRuleCount: 99,
    });
    const payload = buildPayload({ name: 'Whatever' });

    await expect(
      hook.execute(buildAuthContext(), 'carrierConfig', payload),
    ).resolves.toBe(payload);

    expect(decisionRuleRepo.count).not.toHaveBeenCalled();
  });

  it('passes through when the auth context has no workspace', async () => {
    const { hook, workspaceOrmManager } = createHook({
      decisionRuleCount: 99,
    });
    const payload = buildPayload({ name: 'Whatever' });

    await expect(
      hook.execute(
        {} as unknown as WorkspaceAuthContext,
        'carrierConfig',
        payload,
      ),
    ).resolves.toBe(payload);

    expect(
      workspaceOrmManager.executeInWorkspaceContext,
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
