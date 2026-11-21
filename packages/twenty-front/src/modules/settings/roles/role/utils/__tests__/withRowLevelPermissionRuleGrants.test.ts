import { resolveObjectRecordsAccessForFilteredObject } from '@/settings/roles/role/utils/resolveObjectRecordsAccessForFilteredObject';
import { withRowLevelPermissionRuleGrants } from '@/settings/roles/role/utils/withRowLevelPermissionRuleGrants';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import {
  type RowLevelPermissionPredicate,
  RowLevelPermissionPredicateOperand,
  type RowLevelPermissionRule,
} from '~/generated-metadata/graphql';

const ROLE_ID = 'member-role-id';
const POLICY_OBJECT_METADATA_ID = 'policy-object-id';
const PERSON_OBJECT_METADATA_ID = 'person-object-id';

const AGENT_IS_ME_PREDICATE: RowLevelPermissionPredicate = {
  id: 'agent-is-me-predicate-id',
  roleId: ROLE_ID,
  objectMetadataId: POLICY_OBJECT_METADATA_ID,
  relationFieldMetadataId: 'policy-agent-field-id',
  fieldMetadataId: 'agent-profile-workspace-member-field-id',
  workspaceMemberFieldMetadataId: 'workspace-member-id-field-id',
  operand: RowLevelPermissionPredicateOperand.IS,
  value: null,
  subFieldName: null,
  workspaceMemberSubFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
  positionInRowLevelPermissionPredicateGroup: null,
};

const AGENT_POLICY_RULE: RowLevelPermissionRule = {
  id: 'agent-policy-rule-id',
  objectMetadataId: POLICY_OBJECT_METADATA_ID,
  canReadRecords: false,
  canCreateRecords: true,
  canUpdateRecords: true,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
};

// Member → Policy as stored after the v2.58 translation: read all policies, write own (contract C1)
const MEMBER_ROLE: RoleWithPartialMembers = {
  id: ROLE_ID,
  label: 'Member',
  description: '',
  icon: 'IconUser',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canAccessAllAgentChatChannels: false,
  showAllObjectsInSidebar: true,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  applicationId: 'application-id',
  isEditable: true,
  workspaceMembers: [],
  agents: [],
  apiKeys: [],
  permissionFlags: [],
  fieldPermissions: [],
  objectPermissions: [
    {
      objectMetadataId: POLICY_OBJECT_METADATA_ID,
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
      showInSidebar: true,
      editWindowMinutes: 60,
    },
  ],
  rowLevelPermissionPredicates: [AGENT_IS_ME_PREDICATE],
  rowLevelPermissionPredicateGroups: [],
  rowLevelPermissionRules: [AGENT_POLICY_RULE],
};

describe('withRowLevelPermissionRuleGrants', () => {
  it('shows See from the object grant and Edit from the rule, keeping the Omnia columns', () => {
    const foldedRole = withRowLevelPermissionRuleGrants(MEMBER_ROLE);

    expect(foldedRole.objectPermissions).toEqual([
      {
        objectMetadataId: POLICY_OBJECT_METADATA_ID,
        canReadObjectRecords: null,
        canUpdateObjectRecords: null,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: null,
        showInSidebar: true,
        editWindowMinutes: 60,
      },
    ]);
    expect(foldedRole.rowLevelPermissionRules).toEqual([
      {
        ...AGENT_POLICY_RULE,
        canReadRecords: false,
        canCreateRecords: true,
        canUpdateRecords: true,
        canSoftDeleteRecords: true,
        canDestroyRecords: true,
      },
    ]);
  });

  it('round-trips the agent policy rule through the save resolver', () => {
    expect(
      resolveObjectRecordsAccessForFilteredObject({
        role: withRowLevelPermissionRuleGrants(MEMBER_ROLE),
        objectMetadataId: POLICY_OBJECT_METADATA_ID,
      }),
    ).toEqual({
      objectRecordsGrant: {
        canReadObjectRecords: null,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      },
      rowLevelPermissionRuleGrant: {
        canReadRecords: false,
        canCreateRecords: true,
        canUpdateRecords: true,
        canSoftDeleteRecords: false,
        canDestroyRecords: false,
      },
    });
  });

  it('starts a newly granted operation on matching records', () => {
    const foldedRole = withRowLevelPermissionRuleGrants(MEMBER_ROLE);
    const roleWithDeleteGranted = {
      ...foldedRole,
      objectPermissions: (foldedRole.objectPermissions ?? []).map(
        (objectPermission) => ({
          ...objectPermission,
          canSoftDeleteObjectRecords: null,
        }),
      ),
    };

    const { objectRecordsGrant, rowLevelPermissionRuleGrant } =
      resolveObjectRecordsAccessForFilteredObject({
        role: roleWithDeleteGranted,
        objectMetadataId: POLICY_OBJECT_METADATA_ID,
      });

    expect(objectRecordsGrant.canSoftDeleteObjectRecords).toBe(false);
    expect(rowLevelPermissionRuleGrant.canSoftDeleteRecords).toBe(true);
  });

  it('shows the rule grants when every object-level grant is off', () => {
    const foldedRole = withRowLevelPermissionRuleGrants({
      ...MEMBER_ROLE,
      objectPermissions: [
        {
          objectMetadataId: POLICY_OBJECT_METADATA_ID,
          canReadObjectRecords: false,
          canUpdateObjectRecords: false,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: false,
        },
      ],
      rowLevelPermissionRules: [{ ...AGENT_POLICY_RULE, canReadRecords: true }],
    });

    expect(foldedRole.objectPermissions?.[0]).toMatchObject({
      canReadObjectRecords: null,
      canUpdateObjectRecords: null,
      canSoftDeleteObjectRecords: false,
    });
    expect(foldedRole.rowLevelPermissionRules?.[0]).toMatchObject({
      canReadRecords: true,
      canUpdateRecords: true,
    });
  });

  it('shows an object-level grant that a rule also grants as all records', () => {
    const foldedRole = withRowLevelPermissionRuleGrants({
      ...MEMBER_ROLE,
      objectPermissions: [
        {
          objectMetadataId: POLICY_OBJECT_METADATA_ID,
          canReadObjectRecords: true,
          canUpdateObjectRecords: true,
        },
      ],
    });

    expect(foldedRole.rowLevelPermissionRules?.[0]).toMatchObject({
      canReadRecords: false,
      canUpdateRecords: false,
      canCreateRecords: false,
    });
  });

  it('folds several rules of one object into one, granting only what all of them grant', () => {
    const foldedRole = withRowLevelPermissionRuleGrants({
      ...MEMBER_ROLE,
      objectPermissions: [
        {
          objectMetadataId: POLICY_OBJECT_METADATA_ID,
          canReadObjectRecords: false,
          canUpdateObjectRecords: false,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: false,
        },
      ],
      rowLevelPermissionRules: [
        { ...AGENT_POLICY_RULE, canReadRecords: true },
        {
          ...AGENT_POLICY_RULE,
          id: 'other-policy-rule-id',
          canReadRecords: true,
          canUpdateRecords: false,
          canCreateRecords: false,
        },
      ],
    });

    expect(foldedRole.objectPermissions?.[0]).toMatchObject({
      canReadObjectRecords: null,
      canUpdateObjectRecords: false,
    });
    expect(foldedRole.rowLevelPermissionRules).toHaveLength(1);
    expect(foldedRole.rowLevelPermissionRules?.[0]?.id).toBe(
      AGENT_POLICY_RULE.id,
    );
  });

  it('leaves a role without filtered objects untouched', () => {
    const unfilteredRole = {
      ...MEMBER_ROLE,
      rowLevelPermissionPredicates: [],
    };

    expect(withRowLevelPermissionRuleGrants(unfilteredRole)).toBe(
      unfilteredRole,
    );
  });

  it('keeps rules of objects without a filter as they are', () => {
    const personRule = {
      ...AGENT_POLICY_RULE,
      id: 'person-rule-id',
      objectMetadataId: PERSON_OBJECT_METADATA_ID,
    };

    const foldedRole = withRowLevelPermissionRuleGrants({
      ...MEMBER_ROLE,
      rowLevelPermissionRules: [AGENT_POLICY_RULE, personRule],
    });

    expect(foldedRole.rowLevelPermissionRules).toContainEqual(personRule);
    expect(foldedRole.objectPermissions).toHaveLength(1);
  });
});
