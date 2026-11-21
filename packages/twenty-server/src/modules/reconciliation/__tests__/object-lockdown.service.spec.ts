import { Logger } from '@nestjs/common';

import {
  buildLockdownWorkspaceFixture,
  createLockdownServiceMock,
  createLockdownWorkspaceMock,
  LOCKDOWN_WORKSPACE_ID,
  type LockdownWorkspaceState,
} from 'src/modules/reconciliation/listeners/__mocks__/reconciliation-object-lockdown-workspace.mock';

const DENYING_GRANTS = {
  canCreateObjectRecords: false,
  canReadObjectRecords: false,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
};

const setup = (
  overrideState: (state: LockdownWorkspaceState) => LockdownWorkspaceState = (
    state,
  ) => state,
) => {
  const fixture = buildLockdownWorkspaceFixture();
  const workspace = createLockdownWorkspaceMock(overrideState(fixture.state));
  const { service, dependencies } = createLockdownServiceMock(workspace);

  const getReconciliationObjectPermissions = (roleId: string) =>
    workspace.state.objectPermissions.filter(
      (objectPermission) =>
        objectPermission.roleId === roleId &&
        fixture.reconciliationObjectMetadataIds.includes(
          objectPermission.objectMetadataId,
        ),
    );

  const expectRoleLocked = (roleId: string) => {
    const reconciliationObjectPermissions =
      getReconciliationObjectPermissions(roleId);

    expect(reconciliationObjectPermissions).toHaveLength(
      fixture.reconciliationObjectMetadataIds.length,
    );

    for (const objectPermission of reconciliationObjectPermissions) {
      expect(objectPermission).toMatchObject(DENYING_GRANTS);
      expect(objectPermission.showInSidebar).not.toBe(true);
    }

    expect(
      workspace.state.rules.filter(
        (rule) =>
          rule.roleId === roleId &&
          fixture.reconciliationObjectMetadataIds.includes(
            rule.objectMetadataId,
          ),
      ),
    ).toEqual([]);
  };

  return {
    fixture,
    workspace,
    service,
    invalidateAndRecompute: jest.spyOn(
      dependencies.workspaceCacheService,
      'invalidateAndRecompute',
    ),
    evictWorkspaceFromLocalCache: jest.spyOn(
      dependencies.workspaceCacheService,
      'evictWorkspaceFromLocalCache',
    ),
    validateBuildAndRunWorkspaceMigration: jest.spyOn(
      dependencies.workspaceMigrationValidateBuildAndRunService,
      'validateBuildAndRunWorkspaceMigration',
    ),
    upsertGrantRole: jest.spyOn(
      dependencies.applicationGrantRoleService,
      'upsertGrantRole',
    ),
    withLock: jest.spyOn(dependencies.cacheLockService, 'withLock'),
    getReconciliationObjectPermissions,
    expectRoleLocked,
  };
};

describe('ReconciliationObjectLockdownService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('applyToAllNonAdminRoles', () => {
    it('should skip the standard admin by universal identifier even when it is relabelled', async () => {
      const { fixture, service, getReconciliationObjectPermissions } = setup();

      const { lockedRoleLabels } = await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      expect(lockedRoleLabels).not.toContain(fixture.flatRoles.admin.label);
      expect(
        getReconciliationObjectPermissions(fixture.flatRoles.admin.id),
      ).toEqual([]);
    });

    it('should lock a role labelled Admin that is not the standard admin', async () => {
      const { fixture, service, expectRoleLocked } = setup();

      const { lockedRoleLabels } = await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      expect(lockedRoleLabels).toContain('Admin');
      expectRoleLocked(fixture.flatRoles.relabelledAdmin.id);
    });

    it('should lock every non-admin role, including app roles and grant roles', async () => {
      const { fixture, service, expectRoleLocked } = setup();

      const { objectCount, changedRoleIds } =
        await service.applyToAllNonAdminRoles({
          workspaceId: LOCKDOWN_WORKSPACE_ID,
        });

      const { admin: _admin, ...nonAdminFlatRoles } = fixture.flatRoles;

      expect(objectCount).toBe(4);
      expect([...changedRoleIds].sort()).toEqual(
        Object.values(nonAdminFlatRoles)
          .map(({ id }) => id)
          .sort(),
      );

      for (const flatRole of Object.values(nonAdminFlatRoles)) {
        expectRoleLocked(flatRole.id);
      }
    });

    it('should write an app role through a system build owned by its application', async () => {
      const { fixture, service, validateBuildAndRunWorkspaceMigration } =
        setup();

      await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      expect(validateBuildAndRunWorkspaceMigration).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: LOCKDOWN_WORKSPACE_ID,
          isSystemBuild: true,
          applicationUniversalIdentifier:
            fixture.flatApplications.complianceQa.universalIdentifier,
          allFlatEntityOperationByMetadataName: expect.objectContaining({
            objectPermission: expect.objectContaining({
              flatEntityToDelete: [],
              flatEntityToCreate: expect.arrayContaining([
                expect.objectContaining({
                  roleUniversalIdentifier:
                    fixture.flatRoles.complianceQa.universalIdentifier,
                  ...DENYING_GRANTS,
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should re-sync a grant role after locking its source role, so the grant copies the deny rows', async () => {
      const {
        fixture,
        service,
        workspace,
        upsertGrantRole,
        getReconciliationObjectPermissions,
      } = setup();

      await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      expect(upsertGrantRole).toHaveBeenCalledWith({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
        applicationId: fixture.flatApplications.complianceQa.id,
      });

      const sourceUniversalIdentifiers = new Set(
        getReconciliationObjectPermissions(
          fixture.flatRoles.complianceQa.id,
        ).map(({ universalIdentifier }) => universalIdentifier),
      );
      const grantRows = getReconciliationObjectPermissions(
        fixture.flatRoles.complianceQaGrant.id,
      );

      expect(grantRows).toHaveLength(4);
      // Copies keep no row of their own, so the next app sync rebuilds the same deny rows
      expect(
        grantRows.every(
          ({ universalIdentifier }) =>
            !sourceUniversalIdentifiers.has(universalIdentifier),
        ),
      ).toBe(true);
      expect(
        workspace.state.objectPermissions.filter(
          ({ roleId }) => roleId === fixture.flatRoles.complianceQaGrant.id,
        ),
      ).toHaveLength(5);
    });

    it('should lock the twenty-standard grant role in place without re-syncing it from the standard admin', async () => {
      const { fixture, service, upsertGrantRole, expectRoleLocked } = setup();

      await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      expect(upsertGrantRole).not.toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: fixture.flatApplications.twentyStandard.id,
        }),
      );
      expectRoleLocked(fixture.flatRoles.twentyStandardGrant.id);
    });

    it('should delete a rule on a reconciliation object with its predicates, groups and field permissions', async () => {
      const { fixture, service, workspace, invalidateAndRecompute } = setup();

      await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      const reviewItemId = fixture.flatObjectMetadatas.reviewItem.id;

      expect(workspace.state.rules).toEqual([fixture.agentPolicyRule]);
      expect(
        workspace.state.predicates.map(
          ({ objectMetadataId }) => objectMetadataId,
        ),
      ).toEqual([fixture.flatObjectMetadatas.policy.id]);
      expect(workspace.state.predicateGroups).toEqual([]);
      expect(
        workspace.state.fieldPermissions.filter(
          ({ objectMetadataId }) => objectMetadataId === reviewItemId,
        ),
      ).toEqual([]);
      expect(invalidateAndRecompute).toHaveBeenCalledWith(
        LOCKDOWN_WORKSPACE_ID,
        ['rolesPermissions'],
      );
    });

    it('should keep the role permissions on other objects as they are', async () => {
      const { fixture, service, workspace } = setup();

      await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      expect(workspace.state.objectPermissions).toContainEqual(
        fixture.memberPolicyObjectPermission,
      );
    });

    it('should update a deny row that leaves create to the role-wide default', async () => {
      const { fixture, service, getReconciliationObjectPermissions } = setup();
      const [carrierConfigRowBefore] = getReconciliationObjectPermissions(
        fixture.flatRoles.member.id,
      ).filter(
        ({ objectMetadataId }) =>
          objectMetadataId === fixture.flatObjectMetadatas.carrierConfig.id,
      );

      await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      const [carrierConfigRowAfter] = getReconciliationObjectPermissions(
        fixture.flatRoles.member.id,
      ).filter(
        ({ objectMetadataId }) =>
          objectMetadataId === fixture.flatObjectMetadatas.carrierConfig.id,
      );

      expect(carrierConfigRowBefore.canCreateObjectRecords).toBeNull();
      expect(carrierConfigRowAfter).toMatchObject({
        universalIdentifier: carrierConfigRowBefore.universalIdentifier,
        ...DENYING_GRANTS,
      });
    });

    it('should be a no-op on a second run', async () => {
      const {
        service,
        validateBuildAndRunWorkspaceMigration,
        upsertGrantRole,
      } = setup();

      await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      validateBuildAndRunWorkspaceMigration.mockClear();
      upsertGrantRole.mockClear();

      const { changedRoleIds } = await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      expect(changedRoleIds).toEqual([]);
      expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
      expect(upsertGrantRole).not.toHaveBeenCalled();
    });

    it('should report the roles that need locking without writing on a dry run', async () => {
      const {
        fixture,
        service,
        validateBuildAndRunWorkspaceMigration,
        upsertGrantRole,
        withLock,
      } = setup();

      const { objectCount, changedRoleIds } =
        await service.applyToAllNonAdminRoles({
          workspaceId: LOCKDOWN_WORKSPACE_ID,
          dryRun: true,
        });

      expect(objectCount).toBe(4);
      expect(changedRoleIds).toContain(fixture.flatRoles.agent.id);
      expect(changedRoleIds).not.toContain(fixture.flatRoles.admin.id);
      expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
      expect(upsertGrantRole).not.toHaveBeenCalled();
      expect(withLock).not.toHaveBeenCalled();
    });

    it('should report zero objects when the reconciliation objects are not seeded', async () => {
      const { service, validateBuildAndRunWorkspaceMigration } = setup(
        (state) => ({
          ...state,
          objectMetadatas: state.objectMetadatas.filter(
            ({ nameSingular }) => nameSingular === 'policy',
          ),
        }),
      );

      const result = await service.applyToAllNonAdminRoles({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
      });

      expect(result).toEqual({
        objectCount: 0,
        lockedRoleLabels: [],
        changedRoleIds: [],
      });
      expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
    });

    it('should fail loudly when the migration rejects a write', async () => {
      const { service, validateBuildAndRunWorkspaceMigration } = setup();

      validateBuildAndRunWorkspaceMigration.mockResolvedValueOnce({
        status: 'fail',
      });

      await expect(
        service.applyToAllNonAdminRoles({ workspaceId: LOCKDOWN_WORKSPACE_ID }),
      ).rejects.toThrow('Validation errors occurred');
    });
  });

  describe('applyToRole', () => {
    it('should lock a single role under the workspace lock and from a fresh cache read', async () => {
      const {
        fixture,
        service,
        withLock,
        evictWorkspaceFromLocalCache,
        expectRoleLocked,
        getReconciliationObjectPermissions,
      } = setup();

      await service.applyToRole({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
        roleId: fixture.flatRoles.agent.id,
      });

      expectRoleLocked(fixture.flatRoles.agent.id);
      expect(
        getReconciliationObjectPermissions(
          fixture.flatRoles.relabelledAdmin.id,
        ),
      ).toEqual([]);
      expect(withLock).toHaveBeenCalledWith(
        expect.any(Function),
        `reconciliation-object-lockdown:${LOCKDOWN_WORKSPACE_ID}`,
        expect.any(Object),
      );
      expect(evictWorkspaceFromLocalCache).toHaveBeenCalledWith(
        LOCKDOWN_WORKSPACE_ID,
      );
    });

    it('should lock the grant copy when the source role of an application is locked', async () => {
      const { fixture, service, upsertGrantRole, expectRoleLocked } = setup();

      await service.applyToRole({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
        roleId: fixture.flatRoles.complianceQa.id,
      });

      expect(upsertGrantRole).toHaveBeenCalledWith({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
        applicationId: fixture.flatApplications.complianceQa.id,
      });
      expectRoleLocked(fixture.flatRoles.complianceQa.id);
      expectRoleLocked(fixture.flatRoles.complianceQaGrant.id);
    });

    it('should lock the grant role in place when its re-sync fails', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const { fixture, service, upsertGrantRole, expectRoleLocked } = setup();

      upsertGrantRole.mockRejectedValueOnce(new Error('re-sync failed'));

      await service.applyToRole({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
        roleId: fixture.flatRoles.complianceQaGrant.id,
      });

      expectRoleLocked(fixture.flatRoles.complianceQaGrant.id);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should leave the standard admin alone', async () => {
      const { fixture, service, validateBuildAndRunWorkspaceMigration } =
        setup();

      await service.applyToRole({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
        roleId: fixture.flatRoles.admin.id,
      });

      expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
    });

    it('should ignore a role that no longer exists', async () => {
      const { service, validateBuildAndRunWorkspaceMigration } = setup();

      await service.applyToRole({
        workspaceId: LOCKDOWN_WORKSPACE_ID,
        roleId: '20202020-0000-4000-8000-0000000000ff',
      });

      expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
    });
  });
});
