import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type WorkspaceMemberHopMetadata } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/findWorkspaceMemberHop';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { isDefined } from 'twenty-shared/utils';
import {
  RelationType,
  type RowLevelPermissionPredicate,
  type RowLevelPermissionPredicateGroup,
  RowLevelPermissionPredicateGroupLogicalOperator,
  RowLevelPermissionPredicateOperand,
} from '~/generated-metadata/graphql';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const getFieldOrThrow = (
  objectMetadataItem: EnrichedObjectMetadataItem,
  fieldName: string,
): FieldMetadataItem => {
  const fieldMetadataItem = objectMetadataItem.fields.find(
    (field) => field.name === fieldName,
  );

  if (!isDefined(fieldMetadataItem)) {
    throw new Error(`Missing mock field ${fieldName}`);
  }

  return fieldMetadataItem;
};

const TEMPLATE_OBJECT_METADATA_ITEM =
  getMockObjectMetadataItemOrThrow('person');
const RELATION_FIELD_TEMPLATE = getFieldOrThrow(
  TEMPLATE_OBJECT_METADATA_ITEM,
  'company',
);
const TEXT_FIELD_TEMPLATE = getFieldOrThrow(
  TEMPLATE_OBJECT_METADATA_ITEM,
  'jobTitle',
);

export const WORKSPACE_MEMBER_OBJECT_METADATA_ITEM =
  getMockObjectMetadataItemOrThrow('workspaceMember');

export const WORKSPACE_MEMBER_ID_FIELD_METADATA_ID = getFieldOrThrow(
  WORKSPACE_MEMBER_OBJECT_METADATA_ITEM,
  'id',
).id;

const AGENT_PROFILE_OBJECT_METADATA_ID = '20202020-a9e0-4b9e-8c1d-5f0e0a6b0001';
const POLICY_OBJECT_METADATA_ID = '20202020-a9e0-4b9e-8c1d-5f0e0a6b0002';

export const POLICY_NAME_FIELD_METADATA_ID =
  '20202020-a9e0-4b9e-8c1d-5f0e0a6b0010';
export const POLICY_AGENT_FIELD_METADATA_ID =
  '20202020-a9e0-4b9e-8c1d-5f0e0a6b0011';
export const POLICY_ASSIGNEE_FIELD_METADATA_ID =
  '20202020-a9e0-4b9e-8c1d-5f0e0a6b0012';
export const AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID =
  '20202020-a9e0-4b9e-8c1d-5f0e0a6b0020';
export const AGENT_PROFILE_MANAGER_FIELD_METADATA_ID =
  '20202020-a9e0-4b9e-8c1d-5f0e0a6b0021';
const AGENT_PROFILE_NAME_FIELD_METADATA_ID =
  '20202020-a9e0-4b9e-8c1d-5f0e0a6b0022';

const buildRelationField = ({
  id,
  name,
  label,
  sourceObjectMetadataId,
  target,
}: {
  id: string;
  name: string;
  label: string;
  sourceObjectMetadataId: string;
  target: Pick<
    EnrichedObjectMetadataItem,
    'id' | 'nameSingular' | 'namePlural'
  >;
}): FieldMetadataItem => ({
  ...RELATION_FIELD_TEMPLATE,
  id,
  name,
  label,
  settings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: `${name}Id`,
  },
  relation: {
    type: RelationType.MANY_TO_ONE,
    sourceFieldMetadata: { id, name },
    targetFieldMetadata: { id: `${id}-inverse`, name: `${name}Inverse` },
    sourceObjectMetadata: {
      id: sourceObjectMetadataId,
      nameSingular: 'source',
      namePlural: 'sources',
    },
    targetObjectMetadata: {
      id: target.id,
      nameSingular: target.nameSingular,
      namePlural: target.namePlural,
    },
  },
});

const buildTextField = ({
  id,
  name,
  label,
}: {
  id: string;
  name: string;
  label: string;
}): FieldMetadataItem => ({
  ...TEXT_FIELD_TEMPLATE,
  id,
  name,
  label,
});

const buildObjectMetadataItem = ({
  id,
  nameSingular,
  namePlural,
  fields,
}: {
  id: string;
  nameSingular: string;
  namePlural: string;
  fields: FieldMetadataItem[];
}): EnrichedObjectMetadataItem => ({
  ...TEMPLATE_OBJECT_METADATA_ITEM,
  id,
  universalIdentifier: id,
  nameSingular,
  namePlural,
  labelSingular: nameSingular,
  labelPlural: namePlural,
  isActive: true,
  isSystem: false,
  labelIdentifierFieldMetadataId: fields[0].id,
  imageIdentifierFieldMetadataId: null,
  fields,
  readableFields: fields,
  updatableFields: fields,
  indexMetadatas: [],
  searchFieldMetadatas: [],
});

const AGENT_PROFILE_OBJECT = {
  id: AGENT_PROFILE_OBJECT_METADATA_ID,
  nameSingular: 'agentProfile',
  namePlural: 'agentProfiles',
};

// As in prod, agentProfile reaches workspaceMember through workspaceMember and manager
export const AGENT_PROFILE_OBJECT_METADATA_ITEM = buildObjectMetadataItem({
  ...AGENT_PROFILE_OBJECT,
  fields: [
    buildTextField({
      id: AGENT_PROFILE_NAME_FIELD_METADATA_ID,
      name: 'name',
      label: 'Name',
    }),
    buildRelationField({
      id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID,
      name: 'workspaceMember',
      label: 'Workspace Member',
      sourceObjectMetadataId: AGENT_PROFILE_OBJECT_METADATA_ID,
      target: WORKSPACE_MEMBER_OBJECT_METADATA_ITEM,
    }),
    buildRelationField({
      id: AGENT_PROFILE_MANAGER_FIELD_METADATA_ID,
      name: 'manager',
      label: 'Manager',
      sourceObjectMetadataId: AGENT_PROFILE_OBJECT_METADATA_ID,
      target: WORKSPACE_MEMBER_OBJECT_METADATA_ITEM,
    }),
  ],
});

export const POLICY_OBJECT_METADATA_ITEM = buildObjectMetadataItem({
  id: POLICY_OBJECT_METADATA_ID,
  nameSingular: 'policy',
  namePlural: 'policies',
  fields: [
    buildTextField({
      id: POLICY_NAME_FIELD_METADATA_ID,
      name: 'name',
      label: 'Name',
    }),
    buildRelationField({
      id: POLICY_AGENT_FIELD_METADATA_ID,
      name: 'agent',
      label: 'Agent',
      sourceObjectMetadataId: POLICY_OBJECT_METADATA_ID,
      target: AGENT_PROFILE_OBJECT,
    }),
    buildRelationField({
      id: POLICY_ASSIGNEE_FIELD_METADATA_ID,
      name: 'assignee',
      label: 'Assignee',
      sourceObjectMetadataId: POLICY_OBJECT_METADATA_ID,
      target: WORKSPACE_MEMBER_OBJECT_METADATA_ITEM,
    }),
  ],
});

export const WORKSPACE_MEMBER_HOP_TEST_OBJECT_METADATA_ITEMS = [
  WORKSPACE_MEMBER_OBJECT_METADATA_ITEM,
  AGENT_PROFILE_OBJECT_METADATA_ITEM,
  POLICY_OBJECT_METADATA_ITEM,
];

export const WORKSPACE_MEMBER_HOP_TEST_METADATA: WorkspaceMemberHopMetadata = {
  fieldMetadataItems: POLICY_OBJECT_METADATA_ITEM.fields,
  objectMetadataItems: WORKSPACE_MEMBER_HOP_TEST_OBJECT_METADATA_ITEMS,
  workspaceMemberIdFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
};

export const TEST_ROLE_ID = '20202020-a9e0-4b9e-8c1d-5f0e0a6b0100';

export const TEST_ROOT_PREDICATE_GROUP_ID =
  '20202020-a9e0-4b9e-8c1d-5f0e0a6b0300';

export const TEST_ROOT_PREDICATE_GROUP: RowLevelPermissionPredicateGroup = {
  __typename: 'RowLevelPermissionPredicateGroup',
  id: TEST_ROOT_PREDICATE_GROUP_ID,
  roleId: TEST_ROLE_ID,
  objectMetadataId: POLICY_OBJECT_METADATA_ID,
  parentRowLevelPermissionPredicateGroupId: null,
  logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.AND,
  positionInRowLevelPermissionPredicateGroup: null,
  canReadRecords: false,
  canUpdateRecords: false,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
};

export const buildTestDraftRole = (
  overrides: Partial<RoleWithPartialMembers> = {},
): RoleWithPartialMembers => ({
  __typename: 'Role',
  id: TEST_ROLE_ID,
  label: 'Member',
  description: '',
  icon: 'IconUser',
  applicationId: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0400',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canAccessAllAgentChatChannels: false,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  isEditable: true,
  showAllObjectsInSidebar: true,
  workspaceMembers: [],
  agents: [],
  apiKeys: [],
  permissionFlags: [],
  objectPermissions: [],
  fieldPermissions: [],
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
  rowLevelPermissionRules: [],
  ...overrides,
});

// Contract C2: policy.agent ▸ agentProfile.workspaceMember IS workspaceMember.id
export const buildPolicyAgentHopPredicate = (
  overrides: Partial<RowLevelPermissionPredicate> = {},
): RowLevelPermissionPredicate => ({
  __typename: 'RowLevelPermissionPredicate',
  id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0200',
  roleId: TEST_ROLE_ID,
  objectMetadataId: POLICY_OBJECT_METADATA_ID,
  relationFieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
  fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID,
  workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
  operand: RowLevelPermissionPredicateOperand.IS,
  value: null,
  subFieldName: null,
  workspaceMemberSubFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
  positionInRowLevelPermissionPredicateGroup: null,
  ...overrides,
});

export const buildPolicyNamePredicate = (
  overrides: Partial<RowLevelPermissionPredicate> = {},
): RowLevelPermissionPredicate => ({
  __typename: 'RowLevelPermissionPredicate',
  id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0203',
  roleId: TEST_ROLE_ID,
  objectMetadataId: POLICY_OBJECT_METADATA_ID,
  relationFieldMetadataId: null,
  fieldMetadataId: POLICY_NAME_FIELD_METADATA_ID,
  workspaceMemberFieldMetadataId: null,
  operand: RowLevelPermissionPredicateOperand.CONTAINS,
  value: 'Gold',
  subFieldName: null,
  workspaceMemberSubFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
  positionInRowLevelPermissionPredicateGroup: null,
  ...overrides,
});
