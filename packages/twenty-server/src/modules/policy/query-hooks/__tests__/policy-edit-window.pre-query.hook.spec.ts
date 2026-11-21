import { Test, type TestingModule } from '@nestjs/testing';

import { FieldMetadataType } from 'twenty-shared/types';
import { In } from 'typeorm';

import {
  type ApiKeyWorkspaceAuthContext,
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { PrincipalPermissionsReadService } from 'src/engine/permissions/principal-permissions-read.service';
import { type PermissionsPrincipalsWithRolesContext } from 'src/engine/permissions/principal/types/permissions-principals-with-roles-context.type';
import { RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { AgentProfileAssignmentService } from 'src/modules/agent-profile/services/agent-profile-assignment.service';
import { PolicyCreateManyPreQueryHook } from 'src/modules/policy/query-hooks/policy-create-many.pre-query.hook';
import { PolicyCreateOnePreQueryHook } from 'src/modules/policy/query-hooks/policy-create-one.pre-query.hook';
import { PolicyMergeManyPreQueryHook } from 'src/modules/policy/query-hooks/policy-merge-many.pre-query.hook';
import { PolicyUpdateManyPreQueryHook } from 'src/modules/policy/query-hooks/policy-update-many.pre-query.hook';
import { PolicyUpdateOnePreQueryHook } from 'src/modules/policy/query-hooks/policy-update-one.pre-query.hook';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';

const mockApplyFilterToBuilder = jest.fn();

jest.mock(
  'src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/graphql-query.parser',
  () => ({
    GraphqlQueryParser: jest.fn().mockImplementation(() => ({
      applyFilterToBuilder: mockApplyFilterToBuilder,
    })),
  }),
);

const NOW = new Date('2026-11-18T12:00:00.000Z');
const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const USER_WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';
const WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ROLE_ID = 'agent-role-id';
const ADMIN_ROLE_ID = 'admin-role-id';
const POLICY_OBJECT_ID = 'policy-object-id';
const POLICY_ID_FIELD_ID = 'policy-id-field-id';

const OWN_RECENT_POLICY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWN_OLD_POLICY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN_OLD_POLICY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UNKNOWN_POLICY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type PolicyIdWhere = { id: { value: string[] } };

const RLS_DENIAL = {
  message: 'Editing this record violates row-level security',
  extensions: {
    userFriendlyMessage: {
      message: 'Editing this record violates row-level security.',
    },
  },
};

const EDIT_WINDOW_DENIAL = {
  message:
    'Policies older than 15 minutes can only be edited by administrators',
};

const USER_AUTH_CONTEXT = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
  userWorkspaceId: USER_WORKSPACE_ID,
  workspaceMemberId: WORKSPACE_MEMBER_ID,
} as UserWorkspaceAuthContext;

const API_KEY_AUTH_CONTEXT = {
  type: 'apiKey',
  workspace: { id: WORKSPACE_ID },
  apiKey: { id: 'api-key-id' },
} as ApiKeyWorkspaceAuthContext;

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
  new Date(NOW.getTime() - minutes * 60 * 1000);

const STORED_POLICIES = [
  { id: OWN_RECENT_POLICY_ID, createdAt: minutesAgo(5) },
  { id: OWN_OLD_POLICY_ID, createdAt: minutesAgo(16) },
  { id: FOREIGN_OLD_POLICY_ID, createdAt: minutesAgo(16) },
].map((policy) => ({ ...policy, carrierId: null, productId: null }));

// The engine grants the agent updates on its own policies only
const OWN_POLICY_IDS = [OWN_RECENT_POLICY_ID, OWN_OLD_POLICY_ID];

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
) =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const FLAT_OBJECT_METADATA_MAPS = buildFlatEntityMaps([
  getFlatObjectMetadataMock({
    id: POLICY_OBJECT_ID,
    universalIdentifier: POLICY_OBJECT_ID,
    nameSingular: 'policy',
    namePlural: 'policies',
    fieldIds: [POLICY_ID_FIELD_ID],
  }),
]);

const FLAT_FIELD_METADATA_MAPS_ORM = buildFlatEntityMaps([
  getFlatFieldMetadataMock({
    id: POLICY_ID_FIELD_ID,
    universalIdentifier: POLICY_ID_FIELD_ID,
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.UUID,
    name: 'id',
  }),
]);

const buildCacheMaps = ({
  roleId = AGENT_ROLE_ID,
  editWindowMinutes,
}: {
  roleId?: string;
  editWindowMinutes: number | null;
}) => ({
  flatObjectMetadataMaps: FLAT_OBJECT_METADATA_MAPS,
  flatFieldMetadataMapsOrm: FLAT_FIELD_METADATA_MAPS_ORM,
  flatIndexMaps: createEmptyFlatEntityMaps(),
  userWorkspaceRoleMap: { [USER_WORKSPACE_ID]: roleId },
  flatRoleMaps: buildFlatEntityMaps([
    {
      id: AGENT_ROLE_ID,
      universalIdentifier: 'agent-role-universal-identifier',
      editWindowMinutes: null,
    } as FlatRole,
    {
      id: ADMIN_ROLE_ID,
      universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
      editWindowMinutes: null,
    } as FlatRole,
  ]),
  flatObjectPermissionMaps: buildFlatEntityMaps(
    [AGENT_ROLE_ID, ADMIN_ROLE_ID].map(
      (objectPermissionRoleId) =>
        ({
          id: `${objectPermissionRoleId}-policy`,
          universalIdentifier: `${objectPermissionRoleId}-policy`,
          roleId: objectPermissionRoleId,
          objectMetadataId: POLICY_OBJECT_ID,
          editWindowMinutes,
        }) as FlatObjectPermission,
    ),
  ),
});

const WORKSPACE_CONTEXT = {
  flatObjectMetadataMaps: FLAT_OBJECT_METADATA_MAPS,
  flatFieldMetadataMaps: createEmptyFlatEntityMaps(),
  objectIdByNameSingular: { policy: POLICY_OBJECT_ID },
} as unknown as ORMWorkspaceContext;

describe('policy edit window pre-query hooks', () => {
  let updateOneHook: PolicyUpdateOnePreQueryHook;
  let updateManyHook: PolicyUpdateManyPreQueryHook;
  let createOneHook: PolicyCreateOnePreQueryHook;
  let createManyHook: PolicyCreateManyPreQueryHook;
  let mergeManyHook: PolicyMergeManyPreQueryHook;
  let getOrRecompute: jest.Mock;
  let filterGrantedRecordIds: jest.Mock;
  let systemFind: jest.Mock;
  let getRepository: jest.Mock;
  let executeInWorkspaceContext: jest.Mock;
  let queryBuilder: {
    withDeleted: jest.Mock;
    select: jest.Mock;
    limit: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(NOW);

    getOrRecompute = jest
      .fn()
      .mockResolvedValue(buildCacheMaps({ editWindowMinutes: 15 }));
    filterGrantedRecordIds = jest.fn(
      async ({ recordIds }: { recordIds: string[] }) =>
        new Set(
          recordIds
            .filter((recordId) => OWN_POLICY_IDS.includes(recordId))
            .map((recordId) => recordId.toLowerCase()),
        ),
    );
    // Answers both the stored-policy lookup and the upsert match, which passes a list of conditions
    systemFind = jest.fn(
      async ({ where }: { where: PolicyIdWhere | PolicyIdWhere[] }) => {
        const requestedIds = (Array.isArray(where) ? where : [where]).flatMap(
          ({ id }) => id.value,
        );

        return STORED_POLICIES.filter(({ id }) => requestedIds.includes(id));
      },
    );
    queryBuilder = {
      withDeleted: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    getRepository = jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    });
    executeInWorkspaceContext = jest.fn((callback: () => unknown) =>
      withWorkspaceContext(WORKSPACE_CONTEXT, callback),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyUpdateOnePreQueryHook,
        PolicyUpdateManyPreQueryHook,
        PolicyCreateOnePreQueryHook,
        PolicyCreateManyPreQueryHook,
        PolicyMergeManyPreQueryHook,
        PolicyWriteAuthorizationService,
        {
          provide: AgentProfileAssignmentService,
          useValue: { assignAgentProfileToNewRecords: jest.fn() },
        },
        {
          provide: PrincipalPermissionsReadService,
          useValue: {
            resolvePermissionsPrincipals: jest
              .fn()
              .mockResolvedValue(PRINCIPALS),
          },
        },
        {
          provide: RecordPermissionsReadService,
          useValue: { filterGrantedRecordIds },
        },
        { provide: WorkspaceCacheService, useValue: { getOrRecompute } },
        {
          provide: WorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext,
            getRepository,
            getRepositoryWithoutPermissionChecks: jest
              .fn()
              .mockReturnValue({ find: systemFind }),
          },
        },
      ],
    }).compile();

    updateOneHook = module.get(PolicyUpdateOnePreQueryHook);
    updateManyHook = module.get(PolicyUpdateManyPreQueryHook);
    createOneHook = module.get(PolicyCreateOnePreQueryHook);
    createManyHook = module.get(PolicyCreateManyPreQueryHook);
    mergeManyHook = module.get(PolicyMergeManyPreQueryHook);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const grantEveryPolicyToAdmin = () => {
    getOrRecompute.mockResolvedValue(
      buildCacheMaps({ roleId: ADMIN_ROLE_ID, editWindowMinutes: 15 }),
    );
    filterGrantedRecordIds.mockImplementation(
      async ({ recordIds }: { recordIds: string[] }) =>
        new Set(recordIds.map((recordId) => recordId.toLowerCase())),
    );
  };

  describe('updateOne', () => {
    const updatePolicy = (
      id: string,
      authContext: WorkspaceAuthContext = USER_AUTH_CONTEXT,
    ) => {
      const payload = { id, data: { premium: 100 } };

      return {
        payload,
        result: updateOneHook.execute(authContext, 'policy', payload),
      };
    };

    it('blocks an own policy older than the role edit window', async () => {
      await expect(
        updatePolicy(OWN_OLD_POLICY_ID).result,
      ).rejects.toMatchObject(EDIT_WINDOW_DENIAL);
    });

    it('allows an own policy inside the edit window', async () => {
      const { payload, result } = updatePolicy(OWN_RECENT_POLICY_ID);

      await expect(result).resolves.toBe(payload);
    });

    it('reports row-level security before the edit window for a foreign old policy', async () => {
      await expect(
        updatePolicy(FOREIGN_OLD_POLICY_ID).result,
      ).rejects.toMatchObject(RLS_DENIAL);
    });

    it('asks the engine about the stored policy, soft-deleted rows included', async () => {
      await updatePolicy(OWN_RECENT_POLICY_ID).result;

      expect(systemFind).toHaveBeenCalledWith({
        where: { id: In([OWN_RECENT_POLICY_ID]) },
        select: ['id', 'createdAt', 'carrierId', 'productId'],
        withDeleted: true,
      });
      expect(filterGrantedRecordIds).toHaveBeenCalledWith({
        principals: PRINCIPALS,
        objectMetadataId: POLICY_OBJECT_ID,
        operationType: 'update',
        recordIds: [OWN_RECENT_POLICY_ID],
      });
    });

    it('lets the standard admin role edit past the edit window', async () => {
      grantEveryPolicyToAdmin();

      const { payload, result } = updatePolicy(FOREIGN_OLD_POLICY_ID);

      await expect(result).resolves.toBe(payload);
    });

    it('applies no window when the role sets none', async () => {
      getOrRecompute.mockResolvedValue(
        buildCacheMaps({ editWindowMinutes: null }),
      );

      const { payload, result } = updatePolicy(OWN_OLD_POLICY_ID);

      await expect(result).resolves.toBe(payload);
    });

    it('leaves an unknown id to the runner', async () => {
      const { payload, result } = updatePolicy(UNKNOWN_POLICY_ID);

      await expect(result).resolves.toBe(payload);
      expect(filterGrantedRecordIds).not.toHaveBeenCalled();
    });

    it('leaves API key writes to the engine', async () => {
      const { payload, result } = updatePolicy(
        FOREIGN_OLD_POLICY_ID,
        API_KEY_AUTH_CONTEXT,
      );

      await expect(result).resolves.toBe(payload);
      expect(systemFind).not.toHaveBeenCalled();
      expect(filterGrantedRecordIds).not.toHaveBeenCalled();
    });
  });

  describe('updateMany', () => {
    const updatePolicies = (
      filter: Record<string, unknown>,
      authContext: WorkspaceAuthContext = USER_AUTH_CONTEXT,
    ) => {
      const payload = { filter, data: { premium: 100 } };

      return {
        payload,
        result: updateManyHook.execute(authContext, 'policy', payload),
      };
    };

    it('blocks an id list that holds an own policy older than the edit window', async () => {
      await expect(
        updatePolicies({
          id: { in: [OWN_RECENT_POLICY_ID, OWN_OLD_POLICY_ID] },
        }).result,
      ).rejects.toMatchObject(EDIT_WINDOW_DENIAL);
      expect(getRepository).not.toHaveBeenCalled();
    });

    it('reports row-level security before the edit window for a foreign policy in the id list', async () => {
      await expect(
        updatePolicies({
          id: { in: [OWN_OLD_POLICY_ID, FOREIGN_OLD_POLICY_ID] },
        }).result,
      ).rejects.toMatchObject(RLS_DENIAL);
    });

    it('checks the policies a filter other than an id list matches', async () => {
      queryBuilder.getMany.mockResolvedValue([{ id: FOREIGN_OLD_POLICY_ID }]);

      const filter = { status: { eq: 'ACTIVE' } };

      await expect(updatePolicies(filter).result).rejects.toMatchObject(
        RLS_DENIAL,
      );
      expect(getRepository).toHaveBeenCalledWith('policy');
      expect(executeInWorkspaceContext).toHaveBeenCalledWith(
        expect.any(Function),
        USER_AUTH_CONTEXT,
      );
      expect(mockApplyFilterToBuilder).toHaveBeenCalledWith(
        queryBuilder,
        'policy',
        filter,
      );
      expect(queryBuilder.withDeleted).toHaveBeenCalled();
      expect(queryBuilder.select).toHaveBeenCalledWith(['id']);
    });

    it('applies the edit window to an own policy a filter matches', async () => {
      queryBuilder.getMany.mockResolvedValue([{ id: OWN_OLD_POLICY_ID }]);

      await expect(
        updatePolicies({ status: { eq: 'ACTIVE' } }).result,
      ).rejects.toThrow(ForbiddenError);
    });

    it('resolves an id list combined with another condition as a filter', async () => {
      queryBuilder.getMany.mockResolvedValue([{ id: OWN_RECENT_POLICY_ID }]);

      const filter = {
        id: { in: [OWN_RECENT_POLICY_ID, OWN_OLD_POLICY_ID] },
        status: { eq: 'ACTIVE' },
      };
      const { payload, result } = updatePolicies(filter);

      await expect(result).resolves.toBe(payload);
      expect(mockApplyFilterToBuilder).toHaveBeenCalledWith(
        queryBuilder,
        'policy',
        filter,
      );
    });

    it('checks nothing when the ids are unknown or the filter matches no policy', async () => {
      await expect(
        updatePolicies({ id: { in: [UNKNOWN_POLICY_ID] } }).result,
      ).resolves.toBeDefined();
      await expect(
        updatePolicies({ status: { eq: 'CANCELED' } }).result,
      ).resolves.toBeDefined();
      expect(filterGrantedRecordIds).not.toHaveBeenCalled();
    });

    it('leaves an empty filter to the runner, which refuses it', async () => {
      const { payload, result } = updatePolicies({});

      await expect(result).resolves.toBe(payload);
      expect(systemFind).not.toHaveBeenCalled();
      expect(getRepository).not.toHaveBeenCalled();
    });

    it('lets the standard admin role edit past the edit window', async () => {
      grantEveryPolicyToAdmin();

      const { payload, result } = updatePolicies({
        id: { in: [OWN_OLD_POLICY_ID, FOREIGN_OLD_POLICY_ID] },
      });

      await expect(result).resolves.toBe(payload);
    });

    it('leaves API key writes to the engine', async () => {
      const { payload, result } = updatePolicies(
        { status: { eq: 'ACTIVE' } },
        API_KEY_AUTH_CONTEXT,
      );

      await expect(result).resolves.toBe(payload);
      expect(getRepository).not.toHaveBeenCalled();
      expect(filterGrantedRecordIds).not.toHaveBeenCalled();
    });
  });
  describe('create with upsert', () => {
    const NEW_POLICY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    it('blocks an upserted row that rewrites an own policy older than the edit window', async () => {
      await expect(
        createManyHook.execute(USER_AUTH_CONTEXT, 'policy', {
          data: [
            { id: OWN_OLD_POLICY_ID, premium: 100 },
            { id: NEW_POLICY_ID, premium: 100 },
          ],
          upsert: true,
        }),
      ).rejects.toMatchObject(EDIT_WINDOW_DENIAL);
      expect(filterGrantedRecordIds).toHaveBeenCalledWith({
        principals: PRINCIPALS,
        objectMetadataId: POLICY_OBJECT_ID,
        operationType: 'update',
        recordIds: [OWN_OLD_POLICY_ID],
      });
    });

    it('reports row-level security for an upserted row that matches a foreign policy', async () => {
      await expect(
        createOneHook.execute(USER_AUTH_CONTEXT, 'policy', {
          data: { id: FOREIGN_OLD_POLICY_ID, premium: 100 },
          upsert: true,
        }),
      ).rejects.toMatchObject(RLS_DENIAL);
    });

    it('lets an upsert insert new policies and rewrite an own policy inside the window', async () => {
      const payload = {
        data: [{ id: OWN_RECENT_POLICY_ID }, { id: NEW_POLICY_ID }],
        upsert: true,
      };

      await expect(
        createManyHook.execute(USER_AUTH_CONTEXT, 'policy', payload),
      ).resolves.toBe(payload);
    });

    it('checks nothing for a plain create or an API key upsert', async () => {
      await createManyHook.execute(USER_AUTH_CONTEXT, 'policy', {
        data: [{ id: OWN_OLD_POLICY_ID }],
      });
      await createOneHook.execute(API_KEY_AUTH_CONTEXT, 'policy', {
        data: { id: FOREIGN_OLD_POLICY_ID },
        upsert: true,
      });

      expect(systemFind).not.toHaveBeenCalled();
      expect(filterGrantedRecordIds).not.toHaveBeenCalled();
    });
  });

  describe('mergeMany', () => {
    it('blocks a merge that takes in an own policy older than the edit window', async () => {
      await expect(
        mergeManyHook.execute(USER_AUTH_CONTEXT, 'policy', {
          ids: [OWN_RECENT_POLICY_ID, OWN_OLD_POLICY_ID],
          conflictPriorityIndex: 0,
        }),
      ).rejects.toMatchObject(EDIT_WINDOW_DENIAL);
    });

    it('reports row-level security for a merge that takes in a foreign policy', async () => {
      await expect(
        mergeManyHook.execute(USER_AUTH_CONTEXT, 'policy', {
          ids: [OWN_RECENT_POLICY_ID, FOREIGN_OLD_POLICY_ID],
          conflictPriorityIndex: 0,
        }),
      ).rejects.toMatchObject(RLS_DENIAL);
    });

    it('lets the standard admin role merge past the edit window', async () => {
      grantEveryPolicyToAdmin();

      const payload = {
        ids: [OWN_OLD_POLICY_ID, FOREIGN_OLD_POLICY_ID],
        conflictPriorityIndex: 1,
      };

      await expect(
        mergeManyHook.execute(USER_AUTH_CONTEXT, 'policy', payload),
      ).resolves.toBe(payload);
    });

    it('checks nothing for a dry run or an API key merge', async () => {
      await mergeManyHook.execute(USER_AUTH_CONTEXT, 'policy', {
        ids: [OWN_OLD_POLICY_ID, FOREIGN_OLD_POLICY_ID],
        conflictPriorityIndex: 0,
        dryRun: true,
      });
      await mergeManyHook.execute(API_KEY_AUTH_CONTEXT, 'policy', {
        ids: [OWN_OLD_POLICY_ID, FOREIGN_OLD_POLICY_ID],
        conflictPriorityIndex: 0,
      });

      expect(systemFind).not.toHaveBeenCalled();
      expect(filterGrantedRecordIds).not.toHaveBeenCalled();
    });
  });
});
