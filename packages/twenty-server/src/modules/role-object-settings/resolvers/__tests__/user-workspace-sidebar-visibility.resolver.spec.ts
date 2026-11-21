import { Test, type TestingModule } from '@nestjs/testing';

import {
  PermissionFlagType,
  SystemPermissionFlag,
} from 'twenty-shared/constants';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRolePermissionFlag } from 'src/engine/metadata-modules/flat-role-permission-flag/types/flat-role-permission-flag.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { UserWorkspaceSidebarVisibilityResolver } from 'src/modules/role-object-settings/resolvers/user-workspace-sidebar-visibility.resolver';

const WORKSPACE_ID = 'workspace-id';
const APPLICATION_ID = 'application-id';
const USER_WORKSPACE_ID = 'user-workspace-id';
const ROLE_ID = 'member-role-id';

const toFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
): FlatEntityMaps<TFlatEntity> =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const policyObject = getFlatObjectMetadataMock({
  id: 'policy-object-id',
  universalIdentifier: 'policy-universal-identifier',
});
const carrierObject = getFlatObjectMetadataMock({
  id: 'carrier-object-id',
  universalIdentifier: 'carrier-universal-identifier',
});
const noteObject = getFlatObjectMetadataMock({
  id: 'note-object-id',
  universalIdentifier: 'note-universal-identifier',
});
const systemObject = getFlatObjectMetadataMock({
  id: 'system-object-id',
  universalIdentifier: 'system-universal-identifier',
  isSystem: true,
});
const workflowRunObject = getFlatObjectMetadataMock({
  id: 'workflow-run-object-id',
  universalIdentifier: STANDARD_OBJECTS.workflowRun.universalIdentifier,
  isSystem: true,
});
const inactiveObject = getFlatObjectMetadataMock({
  id: 'inactive-object-id',
  universalIdentifier: 'inactive-universal-identifier',
  isActive: false,
});
const WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER =
  'workspace-custom-application-universal-identifier';
const reactivatedStandardObject = getFlatObjectMetadataMock({
  id: 'reactivated-object-id',
  universalIdentifier: 'reactivated-universal-identifier',
  isActive: false,
  overrides: {
    [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: { isActive: true },
  },
});
const deactivatedStandardObject = getFlatObjectMetadataMock({
  id: 'deactivated-object-id',
  universalIdentifier: 'deactivated-universal-identifier',
  isActive: true,
  overrides: {
    [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: { isActive: false },
  },
});

const ALL_FLAT_OBJECT_METADATAS = [
  policyObject,
  carrierObject,
  noteObject,
  systemObject,
  workflowRunObject,
  inactiveObject,
];

const buildFlatObjectPermission = ({
  objectMetadataId,
  showInSidebar,
}: Pick<
  FlatObjectPermission,
  'objectMetadataId' | 'showInSidebar'
>): FlatObjectPermission =>
  ({
    id: `${objectMetadataId}-permission`,
    universalIdentifier: `${objectMetadataId}-permission-universal-identifier`,
    applicationId: APPLICATION_ID,
    roleId: ROLE_ID,
    objectMetadataId,
    showInSidebar,
    editWindowMinutes: null,
  }) as FlatObjectPermission;

const objectPermissions = [
  buildFlatObjectPermission({
    objectMetadataId: policyObject.id,
    showInSidebar: true,
  }),
  buildFlatObjectPermission({
    objectMetadataId: carrierObject.id,
    showInSidebar: false,
  }),
  buildFlatObjectPermission({
    objectMetadataId: inactiveObject.id,
    showInSidebar: true,
  }),
];

const workflowsRolePermissionFlag = {
  id: 'workflows-role-permission-flag-id',
  universalIdentifier: 'workflows-role-permission-flag-universal-identifier',
  applicationId: APPLICATION_ID,
  roleId: ROLE_ID,
  permissionFlagUniversalIdentifier:
    SystemPermissionFlag[PermissionFlagType.WORKFLOWS],
} as FlatRolePermissionFlag;

const buildFlatRole = (
  overrides: Pick<FlatRole, 'rolePermissionFlagIds'>,
): FlatRole =>
  ({
    id: ROLE_ID,
    universalIdentifier: 'member-role-universal-identifier',
    applicationId: APPLICATION_ID,
    showAllObjectsInSidebar: false,
    editWindowMinutes: null,
    canUpdateAllSettings: false,
    canAccessAllTools: false,
    objectPermissionIds: objectPermissions.map(({ id }) => id),
    ...overrides,
  }) as FlatRole;

const userWorkspace = { id: USER_WORKSPACE_ID } as UserWorkspaceEntity;
const workspace = { id: WORKSPACE_ID } as WorkspaceEntity;

describe('UserWorkspaceSidebarVisibilityResolver', () => {
  let resolver: UserWorkspaceSidebarVisibilityResolver;
  let workspaceCacheService: { getOrRecompute: jest.Mock };

  const mockWorkspaceCache = ({
    flatRole,
    userWorkspaceRoleMap = { [USER_WORKSPACE_ID]: ROLE_ID },
    flatObjectMetadatas = ALL_FLAT_OBJECT_METADATAS,
  }: {
    flatRole: FlatRole;
    userWorkspaceRoleMap?: Record<string, string>;
    flatObjectMetadatas?: typeof ALL_FLAT_OBJECT_METADATAS;
  }) => {
    workspaceCacheService.getOrRecompute.mockResolvedValue({
      userWorkspaceRoleMap,
      flatRoleMaps: toFlatEntityMaps([flatRole]),
      flatRolePermissionFlagMaps: toFlatEntityMaps([
        workflowsRolePermissionFlag,
      ]),
      flatObjectPermissionMaps: toFlatEntityMaps(objectPermissions),
      flatObjectMetadataMaps: toFlatEntityMaps(flatObjectMetadatas),
    });
  };

  beforeEach(async () => {
    workspaceCacheService = { getOrRecompute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserWorkspaceSidebarVisibilityResolver,
        { provide: WorkspaceCacheService, useValue: workspaceCacheService },
      ],
    }).compile();

    resolver = module.get(UserWorkspaceSidebarVisibilityResolver);
  });

  it('returns nothing for a userWorkspace that is not the caller', async () => {
    mockWorkspaceCache({
      flatRole: buildFlatRole({ rolePermissionFlagIds: [] }),
    });

    await expect(
      resolver.objectSidebarVisibility(
        { id: 'another-user-workspace-id' } as UserWorkspaceEntity,
        workspace,
        USER_WORKSPACE_ID,
      ),
    ).resolves.toEqual([]);
    expect(workspaceCacheService.getOrRecompute).not.toHaveBeenCalled();
  });

  it('returns nothing without a workspace or a user workspace in the request', async () => {
    await expect(
      resolver.objectSidebarVisibility(
        userWorkspace,
        undefined,
        USER_WORKSPACE_ID,
      ),
    ).resolves.toEqual([]);
    await expect(
      resolver.objectSidebarVisibility(userWorkspace, workspace, undefined),
    ).resolves.toEqual([]);
    expect(workspaceCacheService.getOrRecompute).not.toHaveBeenCalled();
  });

  it('returns nothing when the caller has no role yet', async () => {
    mockWorkspaceCache({
      flatRole: buildFlatRole({ rolePermissionFlagIds: [] }),
      userWorkspaceRoleMap: {},
    });

    await expect(
      resolver.objectSidebarVisibility(
        userWorkspace,
        workspace,
        USER_WORKSPACE_ID,
      ),
    ).resolves.toEqual([]);
  });

  it('returns one entry per active object, resolved for the caller role', async () => {
    mockWorkspaceCache({
      flatRole: buildFlatRole({ rolePermissionFlagIds: [] }),
    });

    const objectSidebarVisibility = await resolver.objectSidebarVisibility(
      userWorkspace,
      workspace,
      USER_WORKSPACE_ID,
    );

    expect(workspaceCacheService.getOrRecompute).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.arrayContaining([
        'userWorkspaceRoleMap',
        'flatRoleMaps',
        'flatObjectPermissionMaps',
        'flatObjectMetadataMaps',
      ]),
    );
    expect(objectSidebarVisibility).toHaveLength(5);
    expect(objectSidebarVisibility).toEqual(
      expect.arrayContaining([
        { objectMetadataId: policyObject.id, showInSidebar: true },
        { objectMetadataId: carrierObject.id, showInSidebar: false },
        { objectMetadataId: noteObject.id, showInSidebar: false },
        { objectMetadataId: systemObject.id, showInSidebar: true },
        { objectMetadataId: workflowRunObject.id, showInSidebar: false },
      ]),
    );
    expect(
      objectSidebarVisibility.map(({ objectMetadataId }) => objectMetadataId),
    ).not.toContain(inactiveObject.id);
  });

  it('follows the workspace override of isActive rather than the stored value', async () => {
    mockWorkspaceCache({
      flatRole: buildFlatRole({ rolePermissionFlagIds: [] }),
      flatObjectMetadatas: [
        reactivatedStandardObject,
        deactivatedStandardObject,
      ],
    });

    await expect(
      resolver.objectSidebarVisibility(
        userWorkspace,
        workspace,
        USER_WORKSPACE_ID,
      ),
    ).resolves.toEqual([
      { objectMetadataId: reactivatedStandardObject.id, showInSidebar: false },
    ]);
  });

  it('shows workflow objects when the caller role holds the WORKFLOWS flag', async () => {
    mockWorkspaceCache({
      flatRole: buildFlatRole({
        rolePermissionFlagIds: [workflowsRolePermissionFlag.id],
      }),
    });

    const objectSidebarVisibility = await resolver.objectSidebarVisibility(
      userWorkspace,
      workspace,
      USER_WORKSPACE_ID,
    );

    expect(objectSidebarVisibility).toContainEqual({
      objectMetadataId: workflowRunObject.id,
      showInSidebar: true,
    });
  });
});
