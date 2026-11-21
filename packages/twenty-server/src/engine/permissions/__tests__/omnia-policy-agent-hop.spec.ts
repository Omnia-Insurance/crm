import { Test, type TestingModule } from '@nestjs/testing';

import { isNonEmptyString } from '@sniptt/guards';
import {
  type ObjectRecordDestroyEvent,
  type ObjectRecordEvent,
  type ObjectRecordUpdateEvent,
} from 'twenty-shared/database-events';
import {
  FeatureFlagKey,
  FieldMetadataType,
  RelationType,
  type RowLevelPermissionPredicate,
  RowLevelPermissionPredicateOperand,
  type RowLevelRecordsPermissions,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ApplicationGrantRoleLookupService } from 'src/engine/core-modules/application/application-grant-role-lookup/services/application-grant-role-lookup.service';
import { type FlatWorkspaceMember } from 'src/engine/core-modules/user/types/flat-workspace-member.type';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { NO_ROLE_RECORDS_PERMISSIONS } from 'src/engine/permissions/constants/no-role-records-permissions.constant';
import { AccessGroupReadService } from 'src/engine/permissions/internal/access-group/services/access-group-read.service';
import { PermissionsMetadataMapsService } from 'src/engine/permissions/internal/combine/services/permissions-metadata-maps.service';
import { PrivateRecordRepository } from 'src/engine/permissions/internal/private-record/repositories/private-record.repository';
import { AccessGroupReadRepository } from 'src/engine/permissions/internal/record-permission-repository/repositories/access-group-read.repository';
import { RecordPermissionReadRepository } from 'src/engine/permissions/internal/record-permission-repository/repositories/record-permission-read.repository';
import { RelatedRecordPathReadService } from 'src/engine/permissions/internal/related-record-path/services/related-record-path-read.service';
import { UNSATISFIABLE_RECORD_FILTER } from 'src/engine/permissions/internal/rls/constants/unsatisfiable-record-filter.constant';
import { renderRowLevelPermissionFilterToSql } from 'src/engine/permissions/internal/rls/utils/render-row-level-permission-filter-to-sql.util';
import { PermissionsExceptionCode } from 'src/engine/permissions/permissions.exception';
import { PrincipalPermissionsReadService } from 'src/engine/permissions/principal-permissions-read.service';
import { type PermissionsAuthContext } from 'src/engine/permissions/principal/types/permissions-auth-context.type';
import { type PermissionsPrincipalsWithRolesContext } from 'src/engine/permissions/principal/types/permissions-principals-with-roles-context.type';
import { RecordEventPermissionsReadService } from 'src/engine/permissions/record-event-permissions-read.service';
import { RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';
import { type RecordPermissionTransactionScope } from 'src/engine/permissions/types/record-permission-transaction-scope.type';
import { type SQLCondition } from 'src/engine/permissions/types/sql-condition.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';

// Contract C2 hop policy.agent → agentProfile.workspaceMember = Me, enforced by
// the engine; PolicyWriteAuthorizationService relies on these answers (C10).
const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const WORKSPACE_CUSTOM_APPLICATION_ID = '20202020-64aa-4b6f-b003-9c74b97cee20';
const READ_ALL_WRITE_OWN_ROLE_ID = 'read-all-write-own-role-id';
const OWN_POLICIES_ONLY_ROLE_ID = 'own-policies-only-role-id';

const MY_WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const MY_USER_ID = '33333333-3333-4333-8333-333333333333';
const MY_USER_WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_WORKSPACE_MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const MY_AGENT_PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_AGENT_PROFILE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MY_POLICY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_POLICY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NEW_POLICY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const POLICY_OBJECT_ID = 'policy-object-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const WORKSPACE_MEMBER_OBJECT_ID = 'workspace-member-object-id';
const POLICY_ID_FIELD_ID = 'policy-id-field-id';
const POLICY_NAME_FIELD_ID = 'policy-name-field-id';
const POLICY_AGENT_FIELD_ID = 'policy-agent-field-id';
const AGENT_PROFILE_POLICIES_FIELD_ID = 'agent-profile-policies-field-id';
const AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID =
  'agent-profile-workspace-member-field-id';
const WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID =
  'workspace-member-agent-profiles-field-id';
const WORKSPACE_MEMBER_ID_FIELD_ID = 'workspace-member-id-field-id';

type AgentProfileRow = {
  id: string;
  workspaceMemberId: string;
  deletedAt: string | null;
};

type PolicyRow = {
  id: string;
  name: string;
  agentId: string | null;
  deletedAt: string | null;
};

const AGENT_PROFILE_ROWS: AgentProfileRow[] = [
  {
    id: MY_AGENT_PROFILE_ID,
    workspaceMemberId: MY_WORKSPACE_MEMBER_ID,
    deletedAt: null,
  },
  {
    id: OTHER_AGENT_PROFILE_ID,
    workspaceMemberId: OTHER_WORKSPACE_MEMBER_ID,
    deletedAt: null,
  },
];

const MY_POLICY_ROW: PolicyRow = {
  id: MY_POLICY_ID,
  name: 'My policy',
  agentId: MY_AGENT_PROFILE_ID,
  deletedAt: null,
};

const OTHER_POLICY_ROW: PolicyRow = {
  id: OTHER_POLICY_ID,
  name: 'Other agent policy',
  agentId: OTHER_AGENT_PROFILE_ID,
  deletedAt: null,
};

const POLICY_ROWS = [MY_POLICY_ROW, OTHER_POLICY_ROW];

const MY_AUTH_CONTEXT: PermissionsAuthContext = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
  workspaceMemberId: MY_WORKSPACE_MEMBER_ID,
};

const TRANSACTION_SCOPE: RecordPermissionTransactionScope = {
  workspaceId: WORKSPACE_ID,
  executeRawQuery: jest.fn(),
};

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
) =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const policyObjectMetadata = getFlatObjectMetadataMock({
  id: POLICY_OBJECT_ID,
  universalIdentifier: POLICY_OBJECT_ID,
  nameSingular: 'policy',
  namePlural: 'policies',
  fieldIds: [POLICY_ID_FIELD_ID, POLICY_NAME_FIELD_ID, POLICY_AGENT_FIELD_ID],
});

const flatObjectMetadataMaps = buildFlatEntityMaps([
  policyObjectMetadata,
  getFlatObjectMetadataMock({
    id: AGENT_PROFILE_OBJECT_ID,
    universalIdentifier: AGENT_PROFILE_OBJECT_ID,
    nameSingular: 'agentProfile',
    namePlural: 'agentProfiles',
    fieldIds: [
      AGENT_PROFILE_POLICIES_FIELD_ID,
      AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    ],
  }),
  getFlatObjectMetadataMock({
    id: WORKSPACE_MEMBER_OBJECT_ID,
    universalIdentifier: WORKSPACE_MEMBER_OBJECT_ID,
    nameSingular: 'workspaceMember',
    namePlural: 'workspaceMembers',
    fieldIds: [
      WORKSPACE_MEMBER_ID_FIELD_ID,
      WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID,
    ],
  }),
]);

const buildRelationField = ({
  id,
  name,
  objectMetadataId,
  relationTargetObjectMetadataId,
  relationTargetFieldMetadataId,
  relationType,
}: {
  id: string;
  name: string;
  objectMetadataId: string;
  relationTargetObjectMetadataId: string;
  relationTargetFieldMetadataId: string;
  relationType: RelationType;
}) =>
  getFlatFieldMetadataMock({
    id,
    universalIdentifier: id,
    objectMetadataId,
    type: FieldMetadataType.RELATION,
    name,
    relationTargetObjectMetadataId,
    relationTargetFieldMetadataId,
    settings:
      relationType === RelationType.MANY_TO_ONE
        ? { relationType, joinColumnName: `${name}Id` }
        : { relationType },
  });

const flatFieldMetadataMaps = buildFlatEntityMaps([
  getFlatFieldMetadataMock({
    id: POLICY_ID_FIELD_ID,
    universalIdentifier: POLICY_ID_FIELD_ID,
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.UUID,
    name: 'id',
  }),
  getFlatFieldMetadataMock({
    id: POLICY_NAME_FIELD_ID,
    universalIdentifier: POLICY_NAME_FIELD_ID,
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.TEXT,
    name: 'name',
  }),
  buildRelationField({
    id: POLICY_AGENT_FIELD_ID,
    name: 'agent',
    objectMetadataId: POLICY_OBJECT_ID,
    relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetFieldMetadataId: AGENT_PROFILE_POLICIES_FIELD_ID,
    relationType: RelationType.MANY_TO_ONE,
  }),
  buildRelationField({
    id: AGENT_PROFILE_POLICIES_FIELD_ID,
    name: 'policies',
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetObjectMetadataId: POLICY_OBJECT_ID,
    relationTargetFieldMetadataId: POLICY_AGENT_FIELD_ID,
    relationType: RelationType.ONE_TO_MANY,
  }),
  buildRelationField({
    id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    name: 'workspaceMember',
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    relationTargetFieldMetadataId: WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID,
    relationType: RelationType.MANY_TO_ONE,
  }),
  buildRelationField({
    id: WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID,
    name: 'agentProfiles',
    objectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetFieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    relationType: RelationType.ONE_TO_MANY,
  }),
  getFlatFieldMetadataMock({
    id: WORKSPACE_MEMBER_ID_FIELD_ID,
    universalIdentifier: WORKSPACE_MEMBER_ID_FIELD_ID,
    objectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    type: FieldMetadataType.UUID,
    name: 'id',
  }),
]);

const buildAgentIsMePolicyRule = ({
  roleId,
  ...grants
}: Pick<
  RowLevelRecordsPermissions,
  | 'canCreateRecords'
  | 'canReadRecords'
  | 'canUpdateRecords'
  | 'canSoftDeleteRecords'
  | 'canDestroyRecords'
> & { roleId: string }): RowLevelRecordsPermissions => {
  const agentIsMeHopPredicate: RowLevelPermissionPredicate = {
    id: `${roleId}-agent-is-me-predicate-id`,
    roleId,
    objectMetadataId: POLICY_OBJECT_ID,
    relationFieldMetadataId: POLICY_AGENT_FIELD_ID,
    fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
    operand: RowLevelPermissionPredicateOperand.IS,
    value: null,
    subFieldName: null,
    workspaceMemberSubFieldName: null,
    rowLevelPermissionPredicateGroupId: null,
  };

  return {
    ruleId: `${roleId}-agent-is-me-rule-id`,
    ...grants,
    predicates: [agentIsMeHopPredicate],
    predicateGroups: [],
    unreadableFields: [],
    uneditableFields: [],
  };
};

const NO_OBJECT_LEVEL_GRANTS = {
  canCreateAllRecords: false,
  canReadAllRecords: false,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  unreadableFields: [],
  uneditableFields: [],
};

const ROLES_PERMISSIONS: Record<string, RoleRecordsPermissions> = {
  // contract C1 canonical Member/Agent → Policy shape
  [READ_ALL_WRITE_OWN_ROLE_ID]: {
    ...NO_ROLE_RECORDS_PERMISSIONS,
    objects: {
      [POLICY_OBJECT_ID]: {
        ...NO_OBJECT_LEVEL_GRANTS,
        canReadAllRecords: true,
        rowLevelRecordsPermissions: [
          buildAgentIsMePolicyRule({
            roleId: READ_ALL_WRITE_OWN_ROLE_ID,
            canCreateRecords: true,
            canReadRecords: false,
            canUpdateRecords: true,
            canSoftDeleteRecords: false,
            canDestroyRecords: false,
          }),
        ],
      },
    },
  },
  // a former ALL-scope predicate: every operation goes through the hop
  [OWN_POLICIES_ONLY_ROLE_ID]: {
    ...NO_ROLE_RECORDS_PERMISSIONS,
    objects: {
      [POLICY_OBJECT_ID]: {
        ...NO_OBJECT_LEVEL_GRANTS,
        rowLevelRecordsPermissions: [
          buildAgentIsMePolicyRule({
            roleId: OWN_POLICIES_ONLY_ROLE_ID,
            canCreateRecords: true,
            canReadRecords: true,
            canUpdateRecords: true,
            canSoftDeleteRecords: true,
            canDestroyRecords: true,
          }),
        ],
      },
    },
  },
};

const buildWorkspaceCache = (roleId: string): Record<string, unknown> => ({
  flatObjectMetadataMaps,
  flatFieldMetadataMapsOrm: flatFieldMetadataMaps,
  featureFlagsMap: {
    [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: true,
    [FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED]: false,
    [FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED]: false,
    [FeatureFlagKey.IS_PRIVATE_RECORDS_ENABLED]: false,
    [FeatureFlagKey.IS_RELATED_RECORD_PATHS_ENABLED]: false,
  },
  rolesPermissions: ROLES_PERMISSIONS,
  flatWorkspaceMemberMaps: {
    byId: {
      [MY_WORKSPACE_MEMBER_ID]: {
        id: MY_WORKSPACE_MEMBER_ID,
        userId: MY_USER_ID,
      } as FlatWorkspaceMember,
    },
    idByUserId: { [MY_USER_ID]: MY_WORKSPACE_MEMBER_ID },
    idByUserWorkspaceId: { [MY_USER_WORKSPACE_ID]: MY_WORKSPACE_MEMBER_ID },
    userWorkspaceIdByUserId: { [MY_USER_ID]: MY_USER_WORKSPACE_ID },
  },
  userWorkspaceRoleMap: { [MY_USER_WORKSPACE_ID]: roleId },
  flatRoleMaps: buildFlatEntityMaps([
    {
      id: roleId,
      universalIdentifier: roleId,
      applicationId: WORKSPACE_CUSTOM_APPLICATION_ID,
    } as FlatRole,
  ]),
  apiKeyRoleMap: {},
  flatRoleTargetByAgentIdMaps: {},
  flatRoleTargetByApplicationIdMaps: {},
  flatApplicationMaps: { byId: {} },
});

// The database is faked: it answers the row-level conditions these roles
// compile to, the hop (from the member ids it binds) and the unsatisfiable one.
const UNSATISFIABLE_SQL = renderRowLevelPermissionFilterToSql({
  recordFilter: UNSATISFIABLE_RECORD_FILTER,
  tableAlias: 'policy',
  objectMetadata: policyObjectMetadata,
  flatFieldMetadataMaps,
  flatObjectMetadataMaps,
})?.sql;

const findHopWorkspaceMemberIdsOrThrow = (
  sqlCondition: SQLCondition,
): string[] => {
  if (!/"workspaceMemberId" IN \(:\.\.\.\w+\)/.test(sqlCondition.sql)) {
    throw new Error(`Unexpected row-level SQL: ${sqlCondition.sql}`);
  }

  return Object.values(sqlCondition.parameters).flat().filter(isNonEmptyString);
};

const isAgentProfileOfWorkspaceMembers = ({
  agentProfileId,
  workspaceMemberIds,
}: {
  agentProfileId: string;
  workspaceMemberIds: string[];
}): boolean =>
  AGENT_PROFILE_ROWS.some(
    (agentProfileRow) =>
      agentProfileRow.id === agentProfileId &&
      agentProfileRow.deletedAt === null &&
      workspaceMemberIds.includes(agentProfileRow.workspaceMemberId),
  );

const findPolicyIdsMatchingSQLCondition = ({
  recordIds,
  sqlCondition,
}: {
  recordIds: string[];
  sqlCondition: SQLCondition | boolean;
}): Set<string> => {
  const candidatePolicyRows = POLICY_ROWS.filter(({ id }) =>
    recordIds.includes(id),
  );

  if (sqlCondition === true) {
    return new Set(candidatePolicyRows.map(({ id }) => id));
  }

  if (sqlCondition === false || sqlCondition.sql === UNSATISFIABLE_SQL) {
    return new Set();
  }

  if (
    !sqlCondition.sql.startsWith('EXISTS') ||
    !sqlCondition.sql.includes('= "policy"."agentId"')
  ) {
    throw new Error(`Unexpected policy SQL: ${sqlCondition.sql}`);
  }

  const workspaceMemberIds = findHopWorkspaceMemberIdsOrThrow(sqlCondition);

  return new Set(
    candidatePolicyRows
      .filter(
        ({ agentId }) =>
          isDefined(agentId) &&
          isAgentProfileOfWorkspaceMembers({
            agentProfileId: agentId,
            workspaceMemberIds,
          }),
      )
      .map(({ id }) => id),
  );
};

type RecordPermissionReadRepositoryArgs<
  TMethod extends keyof RecordPermissionReadRepository,
> = Parameters<RecordPermissionReadRepository[TMethod]>[0];

const buildFakeRecordPermissionReadRepository = () => ({
  findRecordIdsMatchingSQLCondition: jest.fn(
    async ({
      recordIds,
      sqlCondition,
    }: RecordPermissionReadRepositoryArgs<'findRecordIdsMatchingSQLCondition'>) =>
      findPolicyIdsMatchingSQLCondition({ recordIds, sqlCondition }),
  ),
  findRecordIdsMatchingSQLConditions: jest.fn(
    async ({
      recordIds,
      sqlConditions,
    }: RecordPermissionReadRepositoryArgs<'findRecordIdsMatchingSQLConditions'>) =>
      sqlConditions.map((sqlCondition) =>
        findPolicyIdsMatchingSQLCondition({ recordIds, sqlCondition }),
      ),
  ),
  findRelationJoinValues: jest.fn(
    async ({
      targetFlatObjectMetadata,
      targetColumnName,
      sqlCondition,
      joinValues,
    }: RecordPermissionReadRepositoryArgs<'findRelationJoinValues'>) => {
      if (
        targetFlatObjectMetadata.id !== AGENT_PROFILE_OBJECT_ID ||
        targetColumnName !== 'id' ||
        !isDefined(sqlCondition)
      ) {
        throw new Error('Unexpected relation lookup');
      }

      const workspaceMemberIds = findHopWorkspaceMemberIdsOrThrow(sqlCondition);

      return joinValues.filter((agentProfileId) =>
        isAgentProfileOfWorkspaceMembers({
          agentProfileId,
          workspaceMemberIds,
        }),
      );
    },
  ),
  findRecordShares: jest.fn().mockResolvedValue([]),
  findRecordShareAccessLevelsByObjectMetadataId: jest
    .fn()
    .mockResolvedValue(new Map()),
});

const createPermissionServices = async ({ roleId }: { roleId: string }) => {
  const workspaceCache = buildWorkspaceCache(roleId);
  const recordPermissionReadRepository =
    buildFakeRecordPermissionReadRepository();
  const accessGroupReadRepository = {
    findCompactIdsByGroupHashes: jest.fn().mockResolvedValue([]),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RecordPermissionsReadService,
      RecordEventPermissionsReadService,
      PermissionsMetadataMapsService,
      PrincipalPermissionsReadService,
      RelatedRecordPathReadService,
      AccessGroupReadService,
      {
        provide: WorkspaceCacheService,
        useValue: {
          getOrRecompute: jest.fn(
            async (_workspaceId: string, keys: string[]) =>
              Object.fromEntries(keys.map((key) => [key, workspaceCache[key]])),
          ),
        },
      },
      {
        provide: ApplicationGrantRoleLookupService,
        useValue: {
          findWorkspaceCustomApplicationIdOrThrow: jest
            .fn()
            .mockResolvedValue(WORKSPACE_CUSTOM_APPLICATION_ID),
        },
      },
      {
        provide: RecordPermissionReadRepository,
        useValue: recordPermissionReadRepository,
      },
      {
        provide: PrivateRecordRepository,
        useValue: {
          findPrivateRecordStates: jest.fn().mockResolvedValue(new Map()),
        },
      },
      {
        provide: AccessGroupReadRepository,
        useValue: accessGroupReadRepository,
      },
    ],
  }).compile();

  const principalPermissionsReadService = module.get(
    PrincipalPermissionsReadService,
  );

  return {
    module,
    recordPermissionsReadService: module.get(RecordPermissionsReadService),
    recordEventPermissionsReadService: module.get(
      RecordEventPermissionsReadService,
    ),
    principalPermissionsReadService,
    principals:
      await principalPermissionsReadService.resolvePermissionsPrincipalsOrThrow(
        { authContext: MY_AUTH_CONTEXT },
      ),
    accessGroupReadRepository,
  };
};

const buildPolicyUpdateEvent = (
  policyRow: PolicyRow,
): ObjectRecordUpdateEvent<PolicyRow> => ({
  recordId: policyRow.id,
  properties: {
    updatedFields: ['name'],
    diff: { name: { before: 'Previous name', after: policyRow.name } },
    before: { ...policyRow, name: 'Previous name' },
    after: policyRow,
  },
});

const buildPolicyEventBatch = <TEvent extends ObjectRecordEvent>({
  name,
  events,
}: {
  name: string;
  events: TEvent[];
}): WorkspaceEventBatch<TEvent> => ({
  name,
  workspaceId: WORKSPACE_ID,
  objectMetadata: policyObjectMetadata,
  events,
});

describe('Omnia policy agent hop through the record permission services', () => {
  describe('read all, write own (contract C1)', () => {
    let services: Awaited<ReturnType<typeof createPermissionServices>>;

    beforeAll(async () => {
      services = await createPermissionServices({
        roleId: READ_ALL_WRITE_OWN_ROLE_ID,
      });
    });

    afterAll(async () => {
      await services.module.close();
    });

    const filterGrantedPolicyIds = (
      operationType: 'read' | 'update',
      principals: PermissionsPrincipalsWithRolesContext = services.principals,
    ) =>
      services.recordPermissionsReadService.filterGrantedRecordIds({
        principals,
        objectMetadataId: POLICY_OBJECT_ID,
        operationType,
        recordIds: [MY_POLICY_ID, OTHER_POLICY_ID],
      });

    it('should resolve principals that carry the member (C10)', () => {
      expect(services.principals.mainPrincipal).toEqual({
        type: 'workspaceMember',
        workspaceMemberId: MY_WORKSPACE_MEMBER_ID,
        roleId: READ_ALL_WRITE_OWN_ROLE_ID,
      });
    });

    it('should let the member read every policy', async () => {
      await expect(filterGrantedPolicyIds('read')).resolves.toEqual(
        new Set([MY_POLICY_ID, OTHER_POLICY_ID]),
      );
    });

    it('should grant updates only on policies of the member agent profile', async () => {
      await expect(filterGrantedPolicyIds('update')).resolves.toEqual(
        new Set([MY_POLICY_ID]),
      );

      const canUpdatePolicies = (recordIds: string[]) =>
        services.recordPermissionsReadService.canAccessRecords({
          principals: services.principals,
          objectMetadataId: POLICY_OBJECT_ID,
          operationType: 'update',
          recordIds,
        });

      await expect(canUpdatePolicies([MY_POLICY_ID])).resolves.toBe(true);
      await expect(canUpdatePolicies([OTHER_POLICY_ID])).resolves.toBe(false);
      await expect(
        canUpdatePolicies([MY_POLICY_ID, OTHER_POLICY_ID]),
      ).resolves.toBe(false);
    });

    it('should deny updates to role-only principals without a member', async () => {
      const rolePrincipals =
        await services.principalPermissionsReadService.resolveUserWorkspacePermissionsPrincipalsOrThrow(
          {
            workspaceId: WORKSPACE_ID,
            userWorkspaceId: MY_USER_WORKSPACE_ID,
          },
        );

      await expect(
        filterGrantedPolicyIds('update', rolePrincipals),
      ).resolves.toEqual(new Set());
    });

    const assertCreatedPolicyMatches = (agentId: string | null) =>
      services.recordPermissionsReadService.assertCreatedRecordsMatchRowLevelPermissionsOrThrow(
        {
          principals: services.principals,
          objectMetadataId: POLICY_OBJECT_ID,
          records: [
            { id: NEW_POLICY_ID, name: 'New policy', agentId, deletedAt: null },
          ],
          transactionScope: TRANSACTION_SCOPE,
        },
      );

    it('should accept a created policy assigned to the member agent profile', async () => {
      await expect(
        assertCreatedPolicyMatches(MY_AGENT_PROFILE_ID),
      ).resolves.toBeUndefined();
    });

    it.each([
      ['another agent profile', OTHER_AGENT_PROFILE_ID],
      ['no agent profile', null],
    ])('should reject a created policy assigned to %s', async (_, agentId) => {
      await expect(assertCreatedPolicyMatches(agentId)).rejects.toMatchObject({
        code: PermissionsExceptionCode.RLS_VALIDATION_FAILED,
      });
    });

    const assertPolicyUpdateKeepsAccess = (setColumns: Partial<PolicyRow>) =>
      services.recordPermissionsReadService.assertUpdatesKeepRecordAccessOrThrow(
        {
          principals: services.principals,
          objectMetadataId: POLICY_OBJECT_ID,
          updates: [{ rawRecordBefore: MY_POLICY_ROW, setColumns }],
          formatRecords: (rawRecords) => rawRecords,
          transactionScope: TRANSACTION_SCOPE,
        },
      );

    it('should accept an update that keeps the member agent profile', async () => {
      await expect(
        assertPolicyUpdateKeepsAccess({ name: 'Renamed policy' }),
      ).resolves.toBeUndefined();
    });

    it('should reject reassigning a policy away from the member agent profile', async () => {
      await expect(
        assertPolicyUpdateKeepsAccess({ agentId: OTHER_AGENT_PROFILE_ID }),
      ).rejects.toMatchObject({
        code: PermissionsExceptionCode.RLS_VALIDATION_FAILED,
      });
    });

    it('should keep every policy event readable through the object-level read grant', async () => {
      const readableEvents =
        await services.recordEventPermissionsReadService.filterReadableEvents({
          authContext: MY_AUTH_CONTEXT,
          eventBatch: buildPolicyEventBatch({
            name: 'policy.updated',
            events: [
              buildPolicyUpdateEvent(MY_POLICY_ROW),
              buildPolicyUpdateEvent(OTHER_POLICY_ROW),
            ],
          }),
        });

      expect(readableEvents.map(({ recordId }) => recordId)).toEqual([
        MY_POLICY_ID,
        OTHER_POLICY_ID,
      ]);
    });
  });

  describe('own policies only (every operation through the hop)', () => {
    let services: Awaited<ReturnType<typeof createPermissionServices>>;

    beforeAll(async () => {
      services = await createPermissionServices({
        roleId: OWN_POLICIES_ONLY_ROLE_ID,
      });
    });

    afterAll(async () => {
      await services.module.close();
    });

    it("should filter out another agent's policy event", async () => {
      const readableEvents =
        await services.recordEventPermissionsReadService.filterReadableEvents({
          authContext: MY_AUTH_CONTEXT,
          eventBatch: buildPolicyEventBatch({
            name: 'policy.updated',
            events: [
              buildPolicyUpdateEvent(MY_POLICY_ROW),
              buildPolicyUpdateEvent(OTHER_POLICY_ROW),
            ],
          }),
        });

      expect(readableEvents.map(({ recordId }) => recordId)).toEqual([
        MY_POLICY_ID,
      ]);
    });

    it("should filter out another agent's destroyed policy from its last snapshot", async () => {
      const buildPolicyDestroyEvent = (
        policyRow: PolicyRow,
      ): ObjectRecordDestroyEvent<PolicyRow> => ({
        recordId: policyRow.id,
        properties: { before: policyRow },
      });

      const readableEvents =
        await services.recordEventPermissionsReadService.filterReadableEvents({
          authContext: MY_AUTH_CONTEXT,
          eventBatch: buildPolicyEventBatch({
            name: 'policy.destroyed',
            events: [
              buildPolicyDestroyEvent(MY_POLICY_ROW),
              buildPolicyDestroyEvent(OTHER_POLICY_ROW),
            ],
          }),
        });

      expect(readableEvents.map(({ recordId }) => recordId)).toEqual([
        MY_POLICY_ID,
      ]);
    });

    it('should read through the live hop condition, never through access groups', async () => {
      const sqlCondition =
        await services.recordPermissionsReadService.buildReadRecordsAccessSQLCondition(
          {
            principals: services.principals,
            objectMetadataId: POLICY_OBJECT_ID,
            tableAlias: 'policy',
          },
        );

      expect(
        findPolicyIdsMatchingSQLCondition({
          recordIds: [MY_POLICY_ID, OTHER_POLICY_ID],
          sqlCondition,
        }),
      ).toEqual(new Set([MY_POLICY_ID]));
      expect(
        services.accessGroupReadRepository.findCompactIdsByGroupHashes,
      ).not.toHaveBeenCalled();
    });
  });
});
