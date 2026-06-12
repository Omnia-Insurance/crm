// OMNIA-CUSTOM: guard regression test for the reconciliation resolver.
// The mutations here trigger CRM writes (batch apply/undo), so they must
// never regress to NoPermissionGuard (audit 2026-06-10, finding: any
// workspace member could write policies/leads bypassing RLS).

import { GqlExecutionContext } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { PermissionsException } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ReconciliationResolver } from 'src/modules/reconciliation/reconciliation.resolver';
import type { ReconciliationOrchestratorService } from 'src/modules/reconciliation/orchestrator.service';
import type { CarrierConfigValidationService } from 'src/modules/reconciliation/services/carrier-config-validation.service';
import type { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';

const getResolverGuards = (): (new (...args: never[]) => unknown)[] =>
  Reflect.getMetadata('__guards__', ReconciliationResolver) ?? [];

const buildExecutionContext = () =>
  ({
    getContext: () => ({
      req: {
        workspace: {
          id: 'workspace-id',
          activationStatus: WorkspaceActivationStatus.ACTIVE,
        },
        userWorkspaceId: 'user-workspace-id',
      },
    }),
  }) as unknown as GqlExecutionContext;

describe('ReconciliationResolver guards', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses WorkspaceAuthGuard plus a permission guard (not NoPermissionGuard)', () => {
    const guards = getResolverGuards();

    expect(guards[0]).toBe(WorkspaceAuthGuard);
    expect(guards).toHaveLength(2);
    expect(guards[1].name).not.toBe('NoPermissionGuard');
  });

  it('requires the RECONCILIATION setting permission', async () => {
    const guards = getResolverGuards();
    const PermissionGuardClass = guards[1] as new (
      permissionsService: unknown,
    ) => {
      canActivate: (context: unknown) => Promise<boolean>;
    };

    const userHasWorkspaceSettingPermission = jest.fn().mockResolvedValue(true);

    jest
      .spyOn(GqlExecutionContext, 'create')
      .mockReturnValue(buildExecutionContext());

    const guard = new PermissionGuardClass({
      userHasWorkspaceSettingPermission,
    });

    await expect(guard.canActivate({})).resolves.toBe(true);

    expect(userHasWorkspaceSettingPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        setting: PermissionFlagType.RECONCILIATION,
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
      }),
    );
  });

  it('denies members without the permission', async () => {
    const guards = getResolverGuards();
    const PermissionGuardClass = guards[1] as new (
      permissionsService: unknown,
    ) => {
      canActivate: (context: unknown) => Promise<boolean>;
    };

    jest
      .spyOn(GqlExecutionContext, 'create')
      .mockReturnValue(buildExecutionContext());

    const guard = new PermissionGuardClass({
      userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(false),
    });

    await expect(guard.canActivate({})).rejects.toBeInstanceOf(
      PermissionsException,
    );
  });
});

describe('ReconciliationResolver.validateCarrierConfig (OMN-11)', () => {
  const buildResolver = (validateCarrierConfig: jest.Mock) =>
    new ReconciliationResolver(
      {} as unknown as ReconciliationOrchestratorService,
      {} as unknown as ReviewItemService,
      {
        validateCarrierConfig,
      } as unknown as CarrierConfigValidationService,
    );

  const workspace = { id: 'workspace-id' } as WorkspaceEntity;

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
    const validate = jest.fn().mockResolvedValue(serviceResult);
    const resolver = buildResolver(validate);

    await expect(
      resolver.validateCarrierConfig('carrier-config-id', workspace),
    ).resolves.toEqual(serviceResult);

    expect(validate).toHaveBeenCalledWith('workspace-id', 'carrier-config-id');
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
    const resolver = buildResolver(jest.fn().mockResolvedValue(serviceResult));

    const result = await resolver.validateCarrierConfig(
      'carrier-config-id',
      workspace,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.requiredRolesMissing).toEqual(['paidThroughDate']);
  });
});
