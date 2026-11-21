import { Test, type TestingModule } from '@nestjs/testing';

import {
  type ApiKeyWorkspaceAuthContext,
  type ApplicationWorkspaceAuthContext,
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { PrincipalPermissionsReadService } from 'src/engine/permissions/principal-permissions-read.service';
import { type PermissionsPrincipalsWithRolesContext } from 'src/engine/permissions/principal/types/permissions-principals-with-roles-context.type';
import { RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';
import { type PolicyUpdateTarget } from 'src/modules/policy/types/policy-update-target.type';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const USER_WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';
const WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ROLE_ID = 'agent-role-id';
const ADMIN_ROLE_ID = 'admin-role-id';
const POLICY_OBJECT_ID = 'policy-object-id';
const OTHER_OBJECT_ID = 'other-object-id';

const OWN_POLICY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN_POLICY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNASSIGNED_POLICY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OLD_OWN_POLICY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const RLS_DENIAL = {
  message: 'Editing this record violates row-level security',
  extensions: {
    userFriendlyMessage: {
      message: 'Editing this record violates row-level security.',
    },
  },
};

const USER_AUTH_CONTEXT = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
  userWorkspaceId: USER_WORKSPACE_ID,
  workspaceMemberId: WORKSPACE_MEMBER_ID,
} as UserWorkspaceAuthContext;

const PRINCIPALS = {
  workspaceId: WORKSPACE_ID,
  mainPrincipal: {
    type: 'workspaceMember',
    workspaceMemberId: WORKSPACE_MEMBER_ID,
    roleId: AGENT_ROLE_ID,
  },
  applicationPrincipal: { type: 'customApplication' },
} as PermissionsPrincipalsWithRolesContext;

const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
) =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const buildFlatRole = ({
  id,
  universalIdentifier,
  editWindowMinutes,
}: {
  id: string;
  universalIdentifier: string;
  editWindowMinutes: number | null;
}): FlatRole => ({ id, universalIdentifier, editWindowMinutes }) as FlatRole;

const buildFlatObjectPermission = ({
  objectMetadataId,
  editWindowMinutes,
}: {
  objectMetadataId: string;
  editWindowMinutes: number | null;
}): FlatObjectPermission =>
  ({
    id: `${AGENT_ROLE_ID}-${objectMetadataId}`,
    universalIdentifier: `${AGENT_ROLE_ID}-${objectMetadataId}`,
    roleId: AGENT_ROLE_ID,
    objectMetadataId,
    editWindowMinutes,
  }) as FlatObjectPermission;

const buildCacheMaps = ({
  roleId = AGENT_ROLE_ID,
  roleEditWindowMinutes = 60,
  objectPermissions = [],
  hasPolicyObject = true,
}: {
  roleId?: string;
  roleEditWindowMinutes?: number | null;
  objectPermissions?: FlatObjectPermission[];
  hasPolicyObject?: boolean;
} = {}) => ({
  flatObjectMetadataMaps: buildFlatEntityMaps(
    hasPolicyObject
      ? [
          getFlatObjectMetadataMock({
            id: POLICY_OBJECT_ID,
            universalIdentifier: POLICY_OBJECT_ID,
            nameSingular: 'policy',
            namePlural: 'policies',
          }),
        ]
      : [],
  ),
  userWorkspaceRoleMap: { [USER_WORKSPACE_ID]: roleId },
  flatRoleMaps: buildFlatEntityMaps([
    buildFlatRole({
      id: AGENT_ROLE_ID,
      universalIdentifier: 'agent-role-universal-identifier',
      editWindowMinutes: roleEditWindowMinutes,
    }),
    buildFlatRole({
      id: ADMIN_ROLE_ID,
      universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
      editWindowMinutes: 15,
    }),
  ]),
  flatObjectPermissionMaps: buildFlatEntityMaps(objectPermissions),
});

describe('PolicyWriteAuthorizationService', () => {
  let service: PolicyWriteAuthorizationService;
  let resolvePermissionsPrincipals: jest.Mock;
  let filterGrantedRecordIds: jest.Mock;
  let getOrRecompute: jest.Mock;

  const grantUpdateOn = (recordIds: string[]) =>
    filterGrantedRecordIds.mockResolvedValue(
      new Set(recordIds.map((recordId) => recordId.toLowerCase())),
    );

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(NOW);

    resolvePermissionsPrincipals = jest.fn().mockResolvedValue(PRINCIPALS);
    filterGrantedRecordIds = jest.fn().mockResolvedValue(new Set());
    getOrRecompute = jest.fn().mockResolvedValue(buildCacheMaps());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyWriteAuthorizationService,
        {
          provide: PrincipalPermissionsReadService,
          useValue: { resolvePermissionsPrincipals },
        },
        {
          provide: RecordPermissionsReadService,
          useValue: { filterGrantedRecordIds },
        },
        { provide: WorkspaceCacheService, useValue: { getOrRecompute } },
        { provide: WorkspaceOrmManager, useValue: {} },
      ],
    }).compile();

    service = module.get(PolicyWriteAuthorizationService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const assertUserMayUpdatePolicies = (
    policies: PolicyUpdateTarget[],
    authContext: WorkspaceAuthContext = USER_AUTH_CONTEXT,
  ) => service.assertUserMayUpdatePolicies({ authContext, policies });

  it.each([
    ['system', buildSystemAuthContext(WORKSPACE_ID)],
    [
      'API key',
      {
        type: 'apiKey',
        workspace: { id: WORKSPACE_ID },
        apiKey: { id: 'api-key-id' },
      } as ApiKeyWorkspaceAuthContext,
    ],
    [
      'application',
      {
        type: 'application',
        workspace: { id: WORKSPACE_ID },
        application: { id: 'application-id' },
      } as ApplicationWorkspaceAuthContext,
    ],
  ])('leaves %s contexts to the engine', async (_label, authContext) => {
    const policies = [{ id: FOREIGN_POLICY_ID, createdAt: minutesAgo(600) }];

    await expect(
      service.findPolicyUpdateDenials({ authContext, policies }),
    ).resolves.toEqual([]);
    await expect(
      assertUserMayUpdatePolicies(policies, authContext),
    ).resolves.toBeUndefined();
    expect(resolvePermissionsPrincipals).not.toHaveBeenCalled();
    expect(filterGrantedRecordIds).not.toHaveBeenCalled();
  });

  it('leaves the write to the engine when the caller resolves to no principals', async () => {
    resolvePermissionsPrincipals.mockResolvedValue(undefined);

    await expect(
      assertUserMayUpdatePolicies([
        { id: FOREIGN_POLICY_ID, createdAt: minutesAgo(600) },
      ]),
    ).resolves.toBeUndefined();
    expect(filterGrantedRecordIds).not.toHaveBeenCalled();
  });

  it('checks nothing for an empty list', async () => {
    await expect(assertUserMayUpdatePolicies([])).resolves.toBeUndefined();
    expect(resolvePermissionsPrincipals).not.toHaveBeenCalled();
  });

  it('asks the engine for update grants with the user-shaped auth context', async () => {
    grantUpdateOn([OWN_POLICY_ID]);

    await assertUserMayUpdatePolicies([
      { id: OWN_POLICY_ID, createdAt: minutesAgo(5) },
    ]);

    expect(resolvePermissionsPrincipals).toHaveBeenCalledWith({
      authContext: USER_AUTH_CONTEXT,
    });
    expect(filterGrantedRecordIds).toHaveBeenCalledWith({
      principals: PRINCIPALS,
      objectMetadataId: POLICY_OBJECT_ID,
      operationType: 'update',
      recordIds: [OWN_POLICY_ID],
    });
  });

  it('denies a policy the engine does not grant with the row-level security message', async () => {
    await expect(
      assertUserMayUpdatePolicies([
        { id: FOREIGN_POLICY_ID, createdAt: minutesAgo(5) },
      ]),
    ).rejects.toMatchObject(RLS_DENIAL);
  });

  it('denies an unassigned policy the engine does not grant with the row-level security message', async () => {
    grantUpdateOn([OWN_POLICY_ID]);

    await expect(
      assertUserMayUpdatePolicies([
        { id: UNASSIGNED_POLICY_ID, createdAt: minutesAgo(5) },
      ]),
    ).rejects.toMatchObject(RLS_DENIAL);
  });

  it('reports row-level security before the edit window so a foreign policy age never shows', async () => {
    grantUpdateOn([OWN_POLICY_ID]);

    await expect(
      assertUserMayUpdatePolicies([
        { id: OWN_POLICY_ID, createdAt: minutesAgo(600) },
        { id: FOREIGN_POLICY_ID, createdAt: minutesAgo(600) },
      ]),
    ).rejects.toMatchObject(RLS_DENIAL);
  });

  it('denies a granted policy older than the role edit window', async () => {
    grantUpdateOn([OWN_POLICY_ID]);

    await expect(
      assertUserMayUpdatePolicies([
        { id: OWN_POLICY_ID, createdAt: minutesAgo(61) },
      ]),
    ).rejects.toMatchObject({
      message:
        'Policies older than 1 hour can only be edited by administrators',
      extensions: {
        userFriendlyMessage: {
          message:
            'This policy can no longer be edited. Only administrators can modify policies after {window}.',
          values: { window: '1 hour' },
        },
      },
    });
  });

  it('treats an unreadable creation date as outside the window', async () => {
    grantUpdateOn([OWN_POLICY_ID]);

    await expect(
      service.findPolicyUpdateDenials({
        authContext: USER_AUTH_CONTEXT,
        policies: [{ id: OWN_POLICY_ID, createdAt: 'not-a-date' }],
      }),
    ).resolves.toEqual([{ policyId: OWN_POLICY_ID, reason: 'edit-window' }]);
  });

  it('prefers the policy object window over the role default', async () => {
    getOrRecompute.mockResolvedValue(
      buildCacheMaps({
        roleEditWindowMinutes: 600,
        objectPermissions: [
          buildFlatObjectPermission({
            objectMetadataId: OTHER_OBJECT_ID,
            editWindowMinutes: 1,
          }),
          buildFlatObjectPermission({
            objectMetadataId: POLICY_OBJECT_ID,
            editWindowMinutes: 15,
          }),
        ],
      }),
    );
    grantUpdateOn([OWN_POLICY_ID]);

    await expect(
      assertUserMayUpdatePolicies([
        { id: OWN_POLICY_ID, createdAt: minutesAgo(10) },
      ]),
    ).resolves.toBeUndefined();
    await expect(
      assertUserMayUpdatePolicies([
        { id: OWN_POLICY_ID, createdAt: minutesAgo(20) },
      ]),
    ).rejects.toThrow(ForbiddenError);
  });

  it('lets the standard admin role edit past the window', async () => {
    getOrRecompute.mockResolvedValue(buildCacheMaps({ roleId: ADMIN_ROLE_ID }));
    grantUpdateOn([OWN_POLICY_ID]);

    await expect(
      assertUserMayUpdatePolicies([
        { id: OWN_POLICY_ID, createdAt: minutesAgo(600) },
      ]),
    ).resolves.toBeUndefined();
  });

  it('applies no window when neither the role nor the object sets one', async () => {
    getOrRecompute.mockResolvedValue(
      buildCacheMaps({ roleEditWindowMinutes: null }),
    );
    grantUpdateOn([OWN_POLICY_ID]);

    await expect(
      assertUserMayUpdatePolicies([
        { id: OWN_POLICY_ID, createdAt: minutesAgo(60 * 24 * 365) },
      ]),
    ).resolves.toBeUndefined();
  });

  it('applies no window when the user workspace has no role', async () => {
    getOrRecompute.mockResolvedValue(
      buildCacheMaps({ roleId: 'unknown-role-id' }),
    );
    grantUpdateOn([OWN_POLICY_ID]);

    await expect(
      assertUserMayUpdatePolicies([
        { id: OWN_POLICY_ID, createdAt: minutesAgo(600) },
      ]),
    ).resolves.toBeUndefined();
  });

  it('denies every policy when the workspace has no policy object', async () => {
    getOrRecompute.mockResolvedValue(
      buildCacheMaps({ hasPolicyObject: false }),
    );

    await expect(
      service.findPolicyUpdateDenials({
        authContext: USER_AUTH_CONTEXT,
        policies: [{ id: OWN_POLICY_ID, createdAt: minutesAgo(5) }],
      }),
    ).resolves.toEqual([
      { policyId: OWN_POLICY_ID, reason: 'row-level-security' },
    ]);
    expect(filterGrantedRecordIds).not.toHaveBeenCalled();
  });

  it('returns a reason per denied policy and none for allowed ones', async () => {
    grantUpdateOn([OWN_POLICY_ID, OLD_OWN_POLICY_ID]);

    await expect(
      service.findPolicyUpdateDenials({
        authContext: USER_AUTH_CONTEXT,
        policies: [
          { id: OWN_POLICY_ID.toUpperCase(), createdAt: minutesAgo(5) },
          { id: FOREIGN_POLICY_ID, createdAt: minutesAgo(5) },
          { id: UNASSIGNED_POLICY_ID, createdAt: minutesAgo(5) },
          { id: OLD_OWN_POLICY_ID, createdAt: minutesAgo(600) },
        ],
      }),
    ).resolves.toEqual([
      { policyId: FOREIGN_POLICY_ID, reason: 'row-level-security' },
      { policyId: UNASSIGNED_POLICY_ID, reason: 'row-level-security' },
      { policyId: OLD_OWN_POLICY_ID, reason: 'edit-window' },
    ]);
  });
});
