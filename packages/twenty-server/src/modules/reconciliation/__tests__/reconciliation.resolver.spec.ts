import { BadRequestException, type CanActivate } from '@nestjs/common';

import { buildExecutionContextMock } from 'test/utils/build-execution-context-mock.util';

import { PermissionFlagType } from 'twenty-shared/constants';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { workspaceAuthContextStorage } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { AuthenticationError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AccessPolicyService } from 'src/engine/guards/access-policy/access-policy.service';
import { ACCESS_POLICY_GUARD_CONFIG_KEY } from 'src/engine/guards/constants/access-policy-guard-config-key.constant';
import { AuthPrincipalRefusedException } from 'src/engine/guards/exceptions/auth-principal-refused.exception';
import { type AccessPolicy } from 'src/engine/guards/types/access-policy.type';
import { PermissionsException } from 'src/engine/permissions/permissions.exception';
import { type SettingPermissionsService } from 'src/engine/permissions/setting-permissions.service';
import { RECONCILIATION_ACCESS_POLICY } from 'src/modules/reconciliation/constants/reconciliation-access-policy.constant';
import { type ReconciliationOrchestratorService } from 'src/modules/reconciliation/orchestrator.service';
import { ReconciliationResolver } from 'src/modules/reconciliation/reconciliation.resolver';
import { type CarrierConfigValidationService } from 'src/modules/reconciliation/services/carrier-config-validation.service';
import { type ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';

const WORKSPACE_ID = 'workspace-id';
const RECONCILIATION_ID = 'reconciliation-id';

const workspace = {
  id: WORKSPACE_ID,
  activationStatus: WorkspaceActivationStatus.ACTIVE,
};

const userSessionRequest = {
  user: { id: 'user-id' },
  workspace,
  userWorkspaceId: 'user-workspace-id',
  workspaceMemberId: 'workspace-member-id',
  workspaceMember: { id: 'workspace-member-id' },
  tokenType: JwtTokenTypeEnum.ACCESS,
};

const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId: 'user-workspace-id',
  workspaceMemberId: 'workspace-member-id',
} as unknown as UserWorkspaceAuthContext;

type GuardClass = new (accessPolicyService: AccessPolicyService) => CanActivate;

const getResolverGuards = (): GuardClass[] =>
  Reflect.getMetadata('__guards__', ReconciliationResolver) ?? [];

const getResolverAccessPolicy = (): AccessPolicy | undefined => {
  const [guard] = getResolverGuards();

  return Reflect.getMetadata(ACCESS_POLICY_GUARD_CONFIG_KEY, guard);
};

const buildGuard = (hasPermissionFlag: jest.Mock): CanActivate => {
  const [Guard] = getResolverGuards();

  return new Guard(
    new AccessPolicyService(
      { hasPermissionFlag } as unknown as SettingPermissionsService,
      {} as FeatureFlagService,
    ),
  );
};

const buildResolver = ({
  reviewItemService = {},
  carrierConfigValidationService = {},
}: {
  reviewItemService?: Partial<Record<keyof ReviewItemService, jest.Mock>>;
  carrierConfigValidationService?: Partial<
    Record<keyof CarrierConfigValidationService, jest.Mock>
  >;
} = {}) =>
  new ReconciliationResolver(
    {} as unknown as ReconciliationOrchestratorService,
    reviewItemService as unknown as ReviewItemService,
    carrierConfigValidationService as unknown as CarrierConfigValidationService,
  );

const runAs = <TResult>(
  authContext: WorkspaceAuthContext,
  work: () => Promise<TResult>,
): Promise<TResult> => workspaceAuthContextStorage.run(authContext, work);

describe('ReconciliationResolver access policy', () => {
  it('is guarded by a single AccessPolicyGuard, never NoPermissionGuard', () => {
    const guards = getResolverGuards();

    expect(guards).toHaveLength(1);
    expect(guards[0].name).not.toBe('NoPermissionGuard');
    expect(getResolverAccessPolicy()).toBe(RECONCILIATION_ACCESS_POLICY);
  });

  it('requires the RECONCILIATION permission flag', () => {
    expect(getResolverAccessPolicy()?.requiredPermissionFlags).toEqual([
      PermissionFlagType.RECONCILIATION,
    ]);
  });

  it('admits standard and impersonated user sessions only', () => {
    expect(getResolverAccessPolicy()?.authPrincipals).toEqual({
      userSession: {
        standard: true,
        impersonated: true,
        playground: false,
        workspaceAgnostic: false,
      },
      apiKey: false,
      oauthClient: false,
      application: false,
    });
  });

  it('lets a member holding RECONCILIATION through', async () => {
    const hasPermissionFlag = jest.fn().mockResolvedValue(true);

    await expect(
      buildGuard(hasPermissionFlag).canActivate(
        buildExecutionContextMock({ request: userSessionRequest }),
      ),
    ).resolves.toBe(true);
    expect(hasPermissionFlag).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionFlag: PermissionFlagType.RECONCILIATION,
      }),
    );
  });

  it('denies a member without RECONCILIATION', async () => {
    await expect(
      buildGuard(jest.fn().mockResolvedValue(false)).canActivate(
        buildExecutionContextMock({ request: userSessionRequest }),
      ),
    ).rejects.toBeInstanceOf(PermissionsException);
  });

  it('refuses API keys before any permission check', async () => {
    const hasPermissionFlag = jest.fn().mockResolvedValue(true);

    await expect(
      buildGuard(hasPermissionFlag).canActivate(
        buildExecutionContextMock({
          request: {
            apiKey: { id: 'api-key-id' },
            workspace,
            tokenType: JwtTokenTypeEnum.API_KEY,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(AuthPrincipalRefusedException);
    expect(hasPermissionFlag).not.toHaveBeenCalled();
  });
});

describe('ReconciliationResolver batch mutations', () => {
  it('applies with the acting user auth context', async () => {
    const batchApply = jest
      .fn()
      .mockResolvedValue({ updatedCount: 2, skippedCount: 1 });
    const resolver = buildResolver({ reviewItemService: { batchApply } });

    const result = await runAs(userAuthContext, () =>
      resolver.batchApplyReviewItems(
        RECONCILIATION_ID,
        'apply',
        0.9,
        undefined,
      ),
    );

    expect(result.status).toBe('APPLIED_2');
    expect(batchApply).toHaveBeenCalledWith(
      WORKSPACE_ID,
      RECONCILIATION_ID,
      'APPLY',
      { minConfidence: 0.9, reviewItemIds: undefined },
      { authContext: userAuthContext },
    );
  });

  it('approves with the acting user auth context', async () => {
    const batchApprove = jest.fn().mockResolvedValue({ updatedCount: 3 });
    const resolver = buildResolver({ reviewItemService: { batchApprove } });

    const result = await runAs(userAuthContext, () =>
      resolver.batchApproveReviewItems(RECONCILIATION_ID, undefined, [
        'review-item-id',
      ]),
    );

    expect(result.status).toBe('APPROVED_3');
    expect(batchApprove).toHaveBeenCalledWith(
      WORKSPACE_ID,
      RECONCILIATION_ID,
      { minConfidence: undefined, reviewItemIds: ['review-item-id'] },
      { authContext: userAuthContext },
    );
  });

  it('refuses a request without a user context', async () => {
    const batchApply = jest.fn();
    const resolver = buildResolver({ reviewItemService: { batchApply } });

    await expect(
      runAs({ type: 'system', workspace } as WorkspaceAuthContext, () =>
        resolver.batchApplyReviewItems(
          RECONCILIATION_ID,
          'APPLY',
          undefined,
          undefined,
        ),
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(batchApply).not.toHaveBeenCalled();
  });

  it('rejects unknown actions before writing', async () => {
    const batchApply = jest.fn();
    const resolver = buildResolver({ reviewItemService: { batchApply } });

    await expect(
      runAs(userAuthContext, () =>
        resolver.batchApplyReviewItems(
          RECONCILIATION_ID,
          'DELETE',
          undefined,
          undefined,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(batchApply).not.toHaveBeenCalled();
  });
});

describe('ReconciliationResolver.validateCarrierConfig (OMN-11)', () => {
  const resolverWorkspace = { id: WORKSPACE_ID } as WorkspaceEntity;

  it('delegates to the validation service with the workspace id and returns its result', async () => {
    const serviceResult = {
      valid: true,
      errors: [],
      warnings: ['legacy fallback'],
      engineId: 'ambetter-bob-v1',
      startDate: null,
      requiredRolesMissing: [],
      headersChecked: true,
    };
    const validateCarrierConfig = jest.fn().mockResolvedValue(serviceResult);
    const resolver = buildResolver({
      carrierConfigValidationService: { validateCarrierConfig },
    });

    await expect(
      resolver.validateCarrierConfig('carrier-config-id', resolverWorkspace),
    ).resolves.toEqual(serviceResult);

    expect(validateCarrierConfig).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'carrier-config-id',
    );
  });

  it('returns config problems as data, not thrown GraphQL errors', async () => {
    const serviceResult = {
      valid: false,
      errors: ['Unknown status engine id "uho-bob-v1"'],
      warnings: [],
      engineId: 'uho-bob-v1',
      startDate: '2025-07-09',
      requiredRolesMissing: ['paidThroughDate'],
      headersChecked: false,
    };
    const resolver = buildResolver({
      carrierConfigValidationService: {
        validateCarrierConfig: jest.fn().mockResolvedValue(serviceResult),
      },
    });

    const result = await resolver.validateCarrierConfig(
      'carrier-config-id',
      resolverWorkspace,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.requiredRolesMissing).toEqual(['paidThroughDate']);
  });
});
