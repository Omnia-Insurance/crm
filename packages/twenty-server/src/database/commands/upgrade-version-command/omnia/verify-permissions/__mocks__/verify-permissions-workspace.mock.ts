import {
  FieldMetadataType,
  type ObjectRecordsPermissions,
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
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';

export const VERIFY_PERMISSIONS_IDS = {
  workspace: 'verify-permissions-workspace-id',
  adminRole: 'admin-role-id',
  memberRole: 'member-role-id',
  agentRole: 'agent-role-id',
  policyObject: 'policy-object-id',
  agentProfileObject: 'agent-profile-object-id',
  workspaceMemberObject: 'workspace-member-object-id',
  personObject: 'person-object-id',
  reconciliationObject: 'reconciliation-object-id',
  reviewItemObject: 'review-item-object-id',
  policyAgentField: 'policy-agent-field-id',
  policyStatusField: 'policy-status-field-id',
  agentProfilePoliciesField: 'agent-profile-policies-field-id',
  agentProfileWorkspaceMemberField: 'agent-profile-workspace-member-field-id',
  agentProfileManagerField: 'agent-profile-manager-field-id',
  workspaceMemberAgentProfilesField: 'workspace-member-agent-profiles-field-id',
  workspaceMemberIdField: 'workspace-member-id-field-id',
  memberPolicyRule: 'member-policy-rule-id',
  memberPolicyHopPredicate: 'member-policy-hop-predicate-id',
} as const;

export const buildFlatEntityMapsMock = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
): FlatEntityMaps<TFlatEntity> =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

export const VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS = [
  getFlatObjectMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.policyObject,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.policyObject,
    nameSingular: 'policy',
    namePlural: 'policies',
  }),
  getFlatObjectMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.agentProfileObject,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.agentProfileObject,
    nameSingular: 'agentProfile',
    namePlural: 'agentProfiles',
  }),
  getFlatObjectMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.workspaceMemberObject,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.workspaceMemberObject,
    nameSingular: 'workspaceMember',
    namePlural: 'workspaceMembers',
  }),
  getFlatObjectMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.personObject,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.personObject,
    nameSingular: 'person',
    namePlural: 'people',
  }),
  getFlatObjectMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.reconciliationObject,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.reconciliationObject,
    nameSingular: 'reconciliation',
    namePlural: 'reconciliations',
  }),
  getFlatObjectMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.reviewItemObject,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.reviewItemObject,
    nameSingular: 'reviewItem',
    namePlural: 'reviewItems',
  }),
];

export const VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS =
  buildFlatEntityMapsMock(VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS);

export const VERIFY_PERMISSIONS_FLAT_FIELD_METADATAS = [
  getFlatFieldMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.policyAgentField,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.policyAgentField,
    objectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
    type: FieldMetadataType.RELATION,
    name: 'agent',
    relationTargetObjectMetadataId: VERIFY_PERMISSIONS_IDS.agentProfileObject,
    relationTargetFieldMetadataId:
      VERIFY_PERMISSIONS_IDS.agentProfilePoliciesField,
    settings: {
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName: 'agentId',
    },
  }),
  getFlatFieldMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.policyStatusField,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.policyStatusField,
    objectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
    type: FieldMetadataType.SELECT,
    name: 'status',
    options: [
      {
        id: 'option-active',
        value: 'ACTIVE',
        label: 'Active',
        position: 0,
        color: 'green',
      },
    ],
  }),
  getFlatFieldMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.agentProfilePoliciesField,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.agentProfilePoliciesField,
    objectMetadataId: VERIFY_PERMISSIONS_IDS.agentProfileObject,
    type: FieldMetadataType.RELATION,
    name: 'policies',
    relationTargetObjectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
    relationTargetFieldMetadataId: VERIFY_PERMISSIONS_IDS.policyAgentField,
    settings: { relationType: RelationType.ONE_TO_MANY },
  }),
  getFlatFieldMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.agentProfileWorkspaceMemberField,
    universalIdentifier:
      VERIFY_PERMISSIONS_IDS.agentProfileWorkspaceMemberField,
    objectMetadataId: VERIFY_PERMISSIONS_IDS.agentProfileObject,
    type: FieldMetadataType.RELATION,
    name: 'workspaceMember',
    relationTargetObjectMetadataId:
      VERIFY_PERMISSIONS_IDS.workspaceMemberObject,
    relationTargetFieldMetadataId:
      VERIFY_PERMISSIONS_IDS.workspaceMemberAgentProfilesField,
    settings: {
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName: 'workspaceMemberId',
    },
  }),
  // As in prod, agentProfile also points at workspaceMember through manager
  getFlatFieldMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.agentProfileManagerField,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.agentProfileManagerField,
    objectMetadataId: VERIFY_PERMISSIONS_IDS.agentProfileObject,
    type: FieldMetadataType.RELATION,
    name: 'manager',
    relationTargetObjectMetadataId:
      VERIFY_PERMISSIONS_IDS.workspaceMemberObject,
    settings: {
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName: 'managerId',
    },
  }),
  getFlatFieldMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.workspaceMemberAgentProfilesField,
    universalIdentifier:
      VERIFY_PERMISSIONS_IDS.workspaceMemberAgentProfilesField,
    objectMetadataId: VERIFY_PERMISSIONS_IDS.workspaceMemberObject,
    type: FieldMetadataType.RELATION,
    name: 'agentProfiles',
    relationTargetObjectMetadataId: VERIFY_PERMISSIONS_IDS.agentProfileObject,
    relationTargetFieldMetadataId:
      VERIFY_PERMISSIONS_IDS.agentProfileWorkspaceMemberField,
    settings: { relationType: RelationType.ONE_TO_MANY },
  }),
  getFlatFieldMetadataMock({
    id: VERIFY_PERMISSIONS_IDS.workspaceMemberIdField,
    universalIdentifier: VERIFY_PERMISSIONS_IDS.workspaceMemberIdField,
    objectMetadataId: VERIFY_PERMISSIONS_IDS.workspaceMemberObject,
    type: FieldMetadataType.UUID,
    name: 'id',
  }),
];

export const VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS =
  buildFlatEntityMapsMock(VERIFY_PERMISSIONS_FLAT_FIELD_METADATAS);

export type RulePredicateMock = RowLevelPermissionPredicate & {
  rowLevelPermissionRuleId: string | null;
};

export const buildRulePredicateMock = (
  overrides: Pick<RulePredicateMock, 'id'> & Partial<RulePredicateMock>,
): RulePredicateMock => ({
  roleId: VERIFY_PERMISSIONS_IDS.memberRole,
  objectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
  fieldMetadataId: VERIFY_PERMISSIONS_IDS.policyStatusField,
  relationFieldMetadataId: null,
  operand: RowLevelPermissionPredicateOperand.IS,
  value: ['ACTIVE'],
  subFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
  workspaceMemberFieldMetadataId: null,
  workspaceMemberSubFieldName: null,
  rowLevelPermissionRuleId: VERIFY_PERMISSIONS_IDS.memberPolicyRule,
  ...overrides,
});

// Contract C2 as the translation writes it
export const MEMBER_POLICY_HOP_PREDICATE_MOCK = buildRulePredicateMock({
  id: VERIFY_PERMISSIONS_IDS.memberPolicyHopPredicate,
  relationFieldMetadataId: VERIFY_PERMISSIONS_IDS.policyAgentField,
  fieldMetadataId: VERIFY_PERMISSIONS_IDS.agentProfileWorkspaceMemberField,
  workspaceMemberFieldMetadataId: VERIFY_PERMISSIONS_IDS.workspaceMemberIdField,
  value: null,
});

export type RuleMock = Pick<
  FlatRowLevelPermissionRule,
  | 'id'
  | 'roleId'
  | 'objectMetadataId'
  | 'canCreateRecords'
  | 'canReadRecords'
  | 'canUpdateRecords'
  | 'canSoftDeleteRecords'
  | 'canDestroyRecords'
>;

export const buildRuleMock = (
  overrides: Pick<RuleMock, 'id'> & Partial<RuleMock>,
): RuleMock => ({
  roleId: VERIFY_PERMISSIONS_IDS.memberRole,
  objectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
  canCreateRecords: false,
  canReadRecords: false,
  canUpdateRecords: false,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
  ...overrides,
});

// Contract C1 "read all, write own" rule for Member on policy
export const MEMBER_POLICY_RULE_MOCK = buildRuleMock({
  id: VERIFY_PERMISSIONS_IDS.memberPolicyRule,
  canCreateRecords: true,
  canUpdateRecords: true,
});

export const buildObjectRecordsPermissionsMock = (
  overrides: Partial<ObjectRecordsPermissions> = {},
): ObjectRecordsPermissions => ({
  canCreateAllRecords: false,
  canReadAllRecords: false,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  unreadableFields: [],
  uneditableFields: [],
  ...overrides,
});
