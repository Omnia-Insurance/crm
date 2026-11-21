import {
  FeatureFlagKey,
  FieldMetadataType,
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
import { buildMemberFieldValuesOrThrow } from 'src/engine/permissions/internal/rls/utils/build-member-field-values-or-throw.util';
import { buildRowLevelPermissionRecordFilter } from 'src/engine/permissions/internal/rls/utils/build-row-level-permission-record-filter.util';
import { isRowLevelPermissionRelationHopEnabled } from 'src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util';
import { resolveRelationsInRecordFilter } from 'src/engine/permissions/internal/rls/utils/resolve-relations-in-record-filter.util';

const AGENT_ROLE_ID = 'brokerage-agent-role-id';
const WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const MY_AGENT_PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_AGENT_PROFILE_ID = '33333333-3333-4333-8333-333333333333';

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

const agentProfileObjectMetadata = getFlatObjectMetadataMock({
  id: AGENT_PROFILE_OBJECT_ID,
  universalIdentifier: AGENT_PROFILE_OBJECT_ID,
  nameSingular: 'agentProfile',
  namePlural: 'agentProfiles',
  fieldIds: [
    AGENT_PROFILE_POLICIES_FIELD_ID,
    AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
  ],
});

const flatObjectMetadataMaps = buildFlatEntityMaps([
  policyObjectMetadata,
  agentProfileObjectMetadata,
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

const buildAgentIsMePredicate = (
  predicate: Pick<
    RowLevelPermissionPredicate,
    'id' | 'relationFieldMetadataId' | 'fieldMetadataId'
  >,
): RowLevelPermissionPredicate => ({
  roleId: AGENT_ROLE_ID,
  objectMetadataId: POLICY_OBJECT_ID,
  workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
  operand: RowLevelPermissionPredicateOperand.IS,
  value: null,
  subFieldName: null,
  workspaceMemberSubFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
  ...predicate,
});

// contract C2: the shape W1 and Brokerage post-install write
const agentIsMeHopPredicate = buildAgentIsMePredicate({
  id: 'policy-agent-is-me-hop-predicate-id',
  relationFieldMetadataId: POLICY_AGENT_FIELD_ID,
  fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
});

// pre-merge shape: the agent relation compared with the member id
const legacyAgentIsMePredicate = buildAgentIsMePredicate({
  id: 'policy-agent-is-me-legacy-predicate-id',
  relationFieldMetadataId: null,
  fieldMetadataId: POLICY_AGENT_FIELD_ID,
});

const buildPolicyRecordFilter = (predicate: RowLevelPermissionPredicate) =>
  buildRowLevelPermissionRecordFilter({
    rowLevelPermissionRules: [{ predicates: [predicate], predicateGroups: [] }],
    memberFieldValues: buildMemberFieldValuesOrThrow({
      workspaceMember: { id: WORKSPACE_MEMBER_ID },
      predicates: [predicate],
      flatFieldMetadataMaps,
    }),
    currentWorkspaceMemberId: WORKSPACE_MEMBER_ID,
    flatFieldMetadataMaps,
    flatObjectMetadataMaps,
    isRelationHopEnabled: isRowLevelPermissionRelationHopEnabled({
      [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: true,
      [FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED]: false,
    }),
  });

describe('Policy agent ownership RLS', () => {
  it('should resolve policy.agent through the Agent Profile workspace member', async () => {
    const recordFilter = buildPolicyRecordFilter(agentIsMeHopPredicate);
    const findRelationJoinValues = jest
      .fn()
      .mockResolvedValue([MY_AGENT_PROFILE_ID]);

    expect(recordFilter).toEqual({
      agent: { workspaceMemberId: { in: [WORKSPACE_MEMBER_ID] } },
    });

    await expect(
      resolveRelationsInRecordFilter({
        recordFilter,
        flatObjectMetadata: policyObjectMetadata,
        records: [
          { id: 'my-policy-id', agentId: MY_AGENT_PROFILE_ID },
          { id: 'other-policy-id', agentId: OTHER_AGENT_PROFILE_ID },
        ],
        metadataMaps: { flatFieldMetadataMaps, flatObjectMetadataMaps },
        findRelationJoinValues,
      }),
    ).resolves.toEqual({ agentId: { in: [MY_AGENT_PROFILE_ID] } });

    expect(findRelationJoinValues).toHaveBeenCalledWith(
      expect.objectContaining({
        targetFlatObjectMetadata: agentProfileObjectMetadata,
        targetColumnName: 'id',
        joinValues: [MY_AGENT_PROFILE_ID, OTHER_AGENT_PROFILE_ID],
        sqlCondition: expect.objectContaining({
          sql: expect.stringContaining('"workspaceMemberId" IN'),
        }),
      }),
    );

    const [{ sqlCondition }] = findRelationJoinValues.mock.calls[0];

    expect(Object.values(sqlCondition.parameters)).toEqual([
      [WORKSPACE_MEMBER_ID],
    ]);
  });

  it('should never match through the legacy pre-translation predicate', () => {
    // agentId holds agent profile ids, so comparing it with the member id
    // matches nothing; W1 rewrites this shape as the hop
    expect(buildPolicyRecordFilter(legacyAgentIsMePredicate)).toEqual({
      agentId: { in: [WORKSPACE_MEMBER_ID] },
    });
  });
});
