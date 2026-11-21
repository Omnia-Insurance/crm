import {
  FeatureFlagKey,
  FieldMetadataType,
  type ObjectRecordsOperationType,
  RelationType,
  type RowLevelPermissionPredicate,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { NO_ROLE_RECORDS_PERMISSIONS } from 'src/engine/permissions/constants/no-role-records-permissions.constant';
import { type PermissionsMetadataMaps } from 'src/engine/permissions/internal/combine/types/row-access-policy.type';
import { UNSATISFIABLE_RECORD_FILTER } from 'src/engine/permissions/internal/rls/constants/unsatisfiable-record-filter.constant';
import { isRowLevelPermissionRelationHopEnabled } from 'src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util';
import { renderRowLevelPermissionFilterToSql } from 'src/engine/permissions/internal/rls/utils/render-row-level-permission-filter-to-sql.util';
import { resolveRlsRuleRecordFilter } from 'src/engine/permissions/internal/rls/utils/resolve-rls-rule-record-filter.util';
import { type PermissionsPrincipalsWithRolesContext } from 'src/engine/permissions/principal/types/permissions-principals-with-roles-context.type';

// Member/Agent on Policy, contract C1: object-level read on every policy,
// create and update only through the C2 hop policy.agent → agentProfile.workspaceMember = Me
const WORKSPACE_ID = 'omnia-workspace-id';
const AGENT_ROLE_ID = 'agent-role-id';
const WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';

const POLICY_OBJECT_ID = 'policy-object-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const WORKSPACE_MEMBER_OBJECT_ID = 'workspace-member-object-id';

const POLICY_AGENT_FIELD_ID = 'policy-agent-field-id';
const AGENT_PROFILE_POLICIES_FIELD_ID = 'agent-profile-policies-field-id';
const AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID =
  'agent-profile-workspace-member-field-id';
const WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID =
  'workspace-member-agent-profiles-field-id';
const WORKSPACE_MEMBER_ID_FIELD_ID = 'workspace-member-id-field-id';

const HOP_RECORD_FILTER = {
  agent: { workspaceMemberId: { in: [WORKSPACE_MEMBER_ID] } },
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
  fieldIds: [POLICY_AGENT_FIELD_ID],
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

const flatFieldMetadataMaps = buildFlatEntityMaps([
  getFlatFieldMetadataMock({
    id: POLICY_AGENT_FIELD_ID,
    universalIdentifier: POLICY_AGENT_FIELD_ID,
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name: 'agent',
    relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetFieldMetadataId: AGENT_PROFILE_POLICIES_FIELD_ID,
    settings: {
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName: 'agentId',
    },
  }),
  getFlatFieldMetadataMock({
    id: AGENT_PROFILE_POLICIES_FIELD_ID,
    universalIdentifier: AGENT_PROFILE_POLICIES_FIELD_ID,
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name: 'policies',
    relationTargetObjectMetadataId: POLICY_OBJECT_ID,
    relationTargetFieldMetadataId: POLICY_AGENT_FIELD_ID,
    settings: { relationType: RelationType.ONE_TO_MANY },
  }),
  getFlatFieldMetadataMock({
    id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    universalIdentifier: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name: 'workspaceMember',
    relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    relationTargetFieldMetadataId: WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID,
    settings: {
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName: 'workspaceMemberId',
    },
  }),
  getFlatFieldMetadataMock({
    id: WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID,
    universalIdentifier: WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID,
    objectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name: 'agentProfiles',
    relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetFieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    settings: { relationType: RelationType.ONE_TO_MANY },
  }),
  getFlatFieldMetadataMock({
    id: WORKSPACE_MEMBER_ID_FIELD_ID,
    universalIdentifier: WORKSPACE_MEMBER_ID_FIELD_ID,
    objectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    type: FieldMetadataType.UUID,
    name: 'id',
  }),
]);

const agentIsMeHopPredicate: RowLevelPermissionPredicate = {
  id: 'policy-agent-is-me-predicate-id',
  roleId: AGENT_ROLE_ID,
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

const buildMetadataMaps = (
  featureFlagsMap: PermissionsMetadataMaps['featureFlagsMap'],
): PermissionsMetadataMaps => ({
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
  featureFlagsMap,
  rolesPermissions: {
    [AGENT_ROLE_ID]: {
      ...NO_ROLE_RECORDS_PERMISSIONS,
      objects: {
        [POLICY_OBJECT_ID]: {
          canCreateAllRecords: false,
          canReadAllRecords: true,
          canUpdateAllRecords: false,
          canSoftDeleteAllRecords: false,
          canDestroyAllRecords: false,
          unreadableFields: [],
          uneditableFields: [],
          rowLevelRecordsPermissions: [
            {
              ruleId: 'policy-agent-is-me-rule-id',
              canCreateRecords: true,
              canReadRecords: false,
              canUpdateRecords: true,
              canSoftDeleteRecords: false,
              canDestroyRecords: false,
              predicates: [agentIsMeHopPredicate],
              predicateGroups: [],
              unreadableFields: [],
              uneditableFields: [],
            },
          ],
        },
      },
    },
  },
});

const HOP_ONLY_FEATURE_FLAGS = {
  [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: true,
  [FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED]: false,
  [FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED]: false,
  [FeatureFlagKey.IS_PRIVATE_RECORDS_ENABLED]: false,
  [FeatureFlagKey.IS_RELATED_RECORD_PATHS_ENABLED]: false,
};

const agentPrincipals: PermissionsPrincipalsWithRolesContext = {
  workspaceId: WORKSPACE_ID,
  mainPrincipal: {
    type: 'workspaceMember',
    workspaceMemberId: WORKSPACE_MEMBER_ID,
    roleId: AGENT_ROLE_ID,
  },
  applicationPrincipal: { type: 'customApplication' },
};

const resolvePolicyFilter = ({
  operationType,
  featureFlagsMap = HOP_ONLY_FEATURE_FLAGS,
  principals = agentPrincipals,
}: {
  operationType: ObjectRecordsOperationType;
  featureFlagsMap?: PermissionsMetadataMaps['featureFlagsMap'];
  principals?: PermissionsPrincipalsWithRolesContext;
}) =>
  resolveRlsRuleRecordFilter({
    principals,
    metadataMaps: buildMetadataMaps(featureFlagsMap),
    flatObjectMetadata: policyObjectMetadata,
    operationType,
  });

describe('Omnia read-all, write-own Policy rule', () => {
  it('should read every policy through the object-level read grant', () => {
    expect(resolvePolicyFilter({ operationType: 'read' })).toBeNull();
  });

  it('should restrict updates to policies whose agent profile belongs to the member', () => {
    expect(resolvePolicyFilter({ operationType: 'update' })).toEqual(
      HOP_RECORD_FILTER,
    );
  });

  it('should restrict creates through the update rule while create permissions are off', () => {
    expect(
      resolvePolicyFilter({
        operationType: 'create',
        featureFlagsMap: {
          ...HOP_ONLY_FEATURE_FLAGS,
          [FeatureFlagKey.IS_CREATE_RECORDS_PERMISSION_ENABLED]: false,
        },
      }),
    ).toEqual(HOP_RECORD_FILTER);
  });

  it('should deny deletes the rule does not grant', () => {
    expect(resolvePolicyFilter({ operationType: 'destroy' })).toEqual(
      UNSATISFIABLE_RECORD_FILTER,
    );
  });

  it('should match nothing when the hop flag is off', () => {
    expect(
      resolvePolicyFilter({
        operationType: 'update',
        featureFlagsMap: {
          ...HOP_ONLY_FEATURE_FLAGS,
          [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: false,
        },
      }),
    ).toEqual(UNSATISFIABLE_RECORD_FILTER);
  });

  it('should apply the hop with access groups off (Omnia hop gate patch)', () => {
    expect(isRowLevelPermissionRelationHopEnabled(HOP_ONLY_FEATURE_FLAGS)).toBe(
      true,
    );
    expect(
      isRowLevelPermissionRelationHopEnabled({
        [FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED]: true,
      }),
    ).toBe(false);
    expect(resolvePolicyFilter({ operationType: 'update' })).not.toEqual(
      UNSATISFIABLE_RECORD_FILTER,
    );
  });

  it('should match nothing for a principal without a workspace member', () => {
    expect(
      resolvePolicyFilter({
        operationType: 'update',
        principals: {
          workspaceId: WORKSPACE_ID,
          mainPrincipal: { type: 'role', roleId: AGENT_ROLE_ID },
          applicationPrincipal: { type: 'customApplication' },
        },
      }),
    ).toEqual(UNSATISFIABLE_RECORD_FILTER);
  });

  it('should render the hop as a live correlated EXISTS on agent profiles', () => {
    const sqlCondition = renderRowLevelPermissionFilterToSql({
      recordFilter: HOP_RECORD_FILTER,
      tableAlias: 'policy',
      objectMetadata: policyObjectMetadata,
      flatFieldMetadataMaps,
      flatObjectMetadataMaps,
    });

    expect(sqlCondition?.sql).toMatch(
      /^EXISTS \(SELECT 1 FROM "[^"]+"\."_agentProfile" AS "(\w+)" WHERE "\1"\."id" = "policy"\."agentId" AND "\1"\."deletedAt" IS NULL AND .*"\1"\."workspaceMemberId" IN /,
    );
    expect(Object.values(sqlCondition?.parameters ?? {})).toEqual([
      [WORKSPACE_MEMBER_ID],
    ]);
  });
});
