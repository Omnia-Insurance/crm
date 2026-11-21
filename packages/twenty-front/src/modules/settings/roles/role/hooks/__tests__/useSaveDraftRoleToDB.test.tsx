import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

// OMNIA-CUSTOM: the rule upsert carries the Matching records grants (contract C1)
import { UPSERT_ROW_LEVEL_PERMISSION_PREDICATES } from '@/settings/roles/graphql/mutations/upsertRowLevelPermissionPredicatesMutation';
import { useSaveDraftRoleToDB } from '@/settings/roles/role/hooks/useSaveDraftRoleToDB';
// OMNIA-CUSTOM: folds saved rules into the draft as the role page does (contract C1)
import { withRowLevelPermissionRuleGrants } from '@/settings/roles/role/utils/withRowLevelPermissionRuleGrants';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { settingsPersistedRoleFamilyState } from '@/settings/roles/states/settingsPersistedRoleFamilyState';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
// OMNIA-CUSTOM: predicate, rule and object-permission documents for the C1 round trips
import {
  CreateOneRoleDocument,
  type RowLevelPermissionPredicate,
  RowLevelPermissionPredicateGroupLogicalOperator,
  RowLevelPermissionPredicateOperand,
  type RowLevelPermissionRule,
  UpsertObjectPermissionsDocument,
} from '~/generated-metadata/graphql';

const mockUseMutation = jest.fn();
const mockCreateRole = jest.fn();
const mockOtherMutation = jest.fn();
// OMNIA-CUSTOM: captures the object-level and rule grants sent on save (contract C1)
const mockUpsertObjectPermissions = jest.fn();
const mockUpsertRowLevelPermissionPredicates = jest.fn();

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

const ROLE_ID = 'role-id';

const ROLE_BASIC_FIELDS_INPUT = {
  description: '',
  icon: 'IconUser',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canAccessAllAgentChatChannels: false,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: true,
  canBeAssignedToApiKeys: true,
  // OMNIA-CUSTOM: role-wide edit window and sidebar defaults are sent on create and update (contracts C3, C4)
  editWindowMinutes: 30,
  showAllObjectsInSidebar: true,
};

const PERSISTED_ROLE: RoleWithPartialMembers = {
  __typename: 'Role',
  id: ROLE_ID,
  label: 'Sales',
  description: '',
  icon: 'IconUser',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canAccessAllAgentChatChannels: false,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: true,
  canBeAssignedToApiKeys: true,
  // OMNIA-CUSTOM: Omnia role columns; generated Role.showAllObjectsInSidebar is non-null (contracts C3, C4)
  editWindowMinutes: 30,
  showAllObjectsInSidebar: true,
  applicationId: 'application-id',
  isEditable: true,
  workspaceMembers: [],
  agents: [],
  apiKeys: [],
  permissionFlags: [],
  objectPermissions: [],
  fieldPermissions: [],
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
};

const renderUseSaveDraftRoleToDB = ({
  isCreateMode,
  draftRole,
  persistedRole,
  onSuccess,
}: {
  isCreateMode: boolean;
  draftRole: RoleWithPartialMembers;
  persistedRole: RoleWithPartialMembers | undefined;
  onSuccess: (savedRoleId: string) => void;
}) => {
  const store = createStore();

  store.set(settingsDraftRoleFamilyState.atomFamily(ROLE_ID), draftRole);
  store.set(
    settingsPersistedRoleFamilyState.atomFamily(ROLE_ID),
    persistedRole,
  );

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  return renderHook(
    () => useSaveDraftRoleToDB({ roleId: ROLE_ID, isCreateMode, onSuccess }),
    { wrapper: Wrapper },
  );
};

describe('useSaveDraftRoleToDB', () => {
  beforeEach(() => {
    mockCreateRole.mockResolvedValue({
      data: { createOneRole: { id: ROLE_ID } },
    });
    mockOtherMutation.mockResolvedValue({ data: {} });
    mockUseMutation.mockImplementation((document: unknown) => [
      document === CreateOneRoleDocument ? mockCreateRole : mockOtherMutation,
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call onSuccess once with the created role id when creating a role', async () => {
    const onSuccess = jest.fn();

    const { result } = renderUseSaveDraftRoleToDB({
      isCreateMode: true,
      draftRole: { ...PERSISTED_ROLE, label: 'New role' },
      persistedRole: undefined,
      onSuccess,
    });

    await act(async () => {
      await result.current.saveDraftRoleToDB();
    });

    expect(mockCreateRole).toHaveBeenCalledTimes(1);
    expect(mockCreateRole).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          createRoleInput: {
            id: ROLE_ID,
            label: 'New role',
            ...ROLE_BASIC_FIELDS_INPUT,
          },
        },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(ROLE_ID);
  });

  it('should not call onSuccess when the role creation returns no data', async () => {
    const onSuccess = jest.fn();

    mockCreateRole.mockResolvedValue({ data: undefined });

    const { result } = renderUseSaveDraftRoleToDB({
      isCreateMode: true,
      draftRole: { ...PERSISTED_ROLE, label: 'New role' },
      persistedRole: undefined,
      onSuccess,
    });

    await act(async () => {
      await result.current.saveDraftRoleToDB();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('should call onSuccess once with the role id when updating a role', async () => {
    const onSuccess = jest.fn();

    const { result } = renderUseSaveDraftRoleToDB({
      isCreateMode: false,
      draftRole: { ...PERSISTED_ROLE, label: 'Sales team' },
      persistedRole: PERSISTED_ROLE,
      onSuccess,
    });

    await act(async () => {
      await result.current.saveDraftRoleToDB();
    });

    expect(mockCreateRole).not.toHaveBeenCalled();
    expect(mockOtherMutation).toHaveBeenCalledTimes(1);
    expect(mockOtherMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          updateRoleInput: {
            id: ROLE_ID,
            update: { label: 'Sales team', ...ROLE_BASIC_FIELDS_INPUT },
          },
        },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(ROLE_ID);
  });
});

// OMNIA-CUSTOM: record-level rule grants on Policy (contract C1)
const POLICY_OBJECT_METADATA_ID = 'policy-object-id';
const PERSON_OBJECT_METADATA_ID = 'person-object-id';

const AGENT_IS_ME_PREDICATE: RowLevelPermissionPredicate = {
  __typename: 'RowLevelPermissionPredicate',
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
  __typename: 'RowLevelPermissionRule',
  id: 'agent-policy-rule-id',
  objectMetadataId: POLICY_OBJECT_METADATA_ID,
  canReadRecords: false,
  canCreateRecords: true,
  canUpdateRecords: true,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
};

// Member → Policy as stored after the v2.58 translation: read all policies, write own
const MEMBER_ROLE: RoleWithPartialMembers = {
  ...PERSISTED_ROLE,
  label: 'Member',
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
    {
      objectMetadataId: PERSON_OBJECT_METADATA_ID,
      canReadObjectRecords: null,
      canUpdateObjectRecords: null,
      canSoftDeleteObjectRecords: null,
      canDestroyObjectRecords: null,
      showInSidebar: false,
      editWindowMinutes: 15,
    },
  ],
  rowLevelPermissionPredicates: [AGENT_IS_ME_PREDICATE],
  rowLevelPermissionRules: [AGENT_POLICY_RULE],
};

const FOLDED_MEMBER_ROLE = withRowLevelPermissionRuleGrants(MEMBER_ROLE);

const withPersonDestroyGranted = (
  role: RoleWithPartialMembers,
): RoleWithPartialMembers => ({
  ...role,
  objectPermissions: (role.objectPermissions ?? []).map((objectPermission) =>
    objectPermission.objectMetadataId === PERSON_OBJECT_METADATA_ID
      ? { ...objectPermission, canDestroyObjectRecords: true }
      : objectPermission,
  ),
});

const getSentObjectPermission = (objectMetadataId: string) =>
  mockUpsertObjectPermissions.mock.calls[0][0].variables.upsertObjectPermissionsInput.objectPermissions.find(
    (objectPermission: { objectMetadataId: string }) =>
      objectPermission.objectMetadataId === objectMetadataId,
  );

const getSentRowLevelPermissionInput = () =>
  mockUpsertRowLevelPermissionPredicates.mock.calls[0][0].variables.input;

describe('useSaveDraftRoleToDB with record-level rules', () => {
  beforeEach(() => {
    mockCreateRole.mockResolvedValue({
      data: { createOneRole: { id: ROLE_ID } },
    });
    mockOtherMutation.mockResolvedValue({ data: {} });
    mockUpsertObjectPermissions.mockResolvedValue({ data: {} });
    mockUpsertRowLevelPermissionPredicates.mockResolvedValue({ data: {} });
    mockUseMutation.mockImplementation((document: unknown) => {
      if (document === CreateOneRoleDocument) {
        return [mockCreateRole];
      }

      if (document === UpsertObjectPermissionsDocument) {
        return [mockUpsertObjectPermissions];
      }

      if (document === UPSERT_ROW_LEVEL_PERMISSION_PREDICATES) {
        return [mockUpsertRowLevelPermissionPredicates];
      }

      return [mockOtherMutation];
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const saveMemberRole = async (draftRole: RoleWithPartialMembers) => {
    const { result } = renderUseSaveDraftRoleToDB({
      isCreateMode: false,
      draftRole,
      persistedRole: FOLDED_MEMBER_ROLE,
      onSuccess: jest.fn(),
    });

    await act(async () => {
      await result.current.saveDraftRoleToDB();
    });
  };

  it('keeps Policy read-all and own-policy edits when the Member role is opened and saved', async () => {
    await saveMemberRole(withPersonDestroyGranted(FOLDED_MEMBER_ROLE));

    expect(getSentObjectPermission(POLICY_OBJECT_METADATA_ID)).toEqual({
      objectMetadataId: POLICY_OBJECT_METADATA_ID,
      canReadObjectRecords: null,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
      showInSidebar: true,
      editWindowMinutes: 60,
    });
    expect(getSentRowLevelPermissionInput()).toMatchObject({
      roleId: ROLE_ID,
      objectMetadataId: POLICY_OBJECT_METADATA_ID,
      canReadRecords: false,
      canCreateRecords: true,
      canUpdateRecords: true,
      canSoftDeleteRecords: false,
      canDestroyRecords: false,
    });
  });

  it('sends the Agent is Me hop predicate unchanged', async () => {
    await saveMemberRole(withPersonDestroyGranted(FOLDED_MEMBER_ROLE));

    expect(getSentRowLevelPermissionInput().predicates).toEqual([
      {
        id: AGENT_IS_ME_PREDICATE.id,
        relationFieldMetadataId: 'policy-agent-field-id',
        fieldMetadataId: 'agent-profile-workspace-member-field-id',
        workspaceMemberFieldMetadataId: 'workspace-member-id-field-id',
        operand: RowLevelPermissionPredicateOperand.IS,
        value: null,
        subFieldName: null,
        workspaceMemberSubFieldName: null,
        rowLevelPermissionPredicateGroupId: null,
        positionInRowLevelPermissionPredicateGroup: null,
      },
    ]);
  });

  it('keeps the sidebar visibility and edit window of every re-sent row', async () => {
    await saveMemberRole(withPersonDestroyGranted(FOLDED_MEMBER_ROLE));

    expect(getSentObjectPermission(PERSON_OBJECT_METADATA_ID)).toEqual({
      objectMetadataId: PERSON_OBJECT_METADATA_ID,
      canReadObjectRecords: null,
      canUpdateObjectRecords: null,
      canSoftDeleteObjectRecords: null,
      canDestroyObjectRecords: true,
      showInSidebar: false,
      editWindowMinutes: 15,
    });
  });

  it('does not save anything when the folded Member role is unchanged', async () => {
    await saveMemberRole(FOLDED_MEMBER_ROLE);

    expect(mockUpsertObjectPermissions).not.toHaveBeenCalled();
    expect(mockUpsertRowLevelPermissionPredicates).not.toHaveBeenCalled();
    expect(mockOtherMutation).not.toHaveBeenCalled();
  });

  it('sends an operation switched to matching records as an explicit object-level false', async () => {
    await saveMemberRole({
      ...FOLDED_MEMBER_ROLE,
      rowLevelPermissionRules: [
        {
          ...AGENT_POLICY_RULE,
          canReadRecords: true,
          canUpdateRecords: true,
          canCreateRecords: true,
          canSoftDeleteRecords: true,
          canDestroyRecords: true,
        },
      ],
    });

    expect(getSentObjectPermission(POLICY_OBJECT_METADATA_ID)).toMatchObject({
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
    expect(getSentRowLevelPermissionInput()).toMatchObject({
      canReadRecords: true,
      canCreateRecords: true,
      canUpdateRecords: true,
      canSoftDeleteRecords: false,
      canDestroyRecords: false,
    });
  });

  it('restricts every granted operation of a new filter to matching records', async () => {
    const { result } = renderUseSaveDraftRoleToDB({
      isCreateMode: false,
      draftRole: {
        ...PERSISTED_ROLE,
        rowLevelPermissionPredicates: [AGENT_IS_ME_PREDICATE],
      },
      persistedRole: PERSISTED_ROLE,
      onSuccess: jest.fn(),
    });

    await act(async () => {
      await result.current.saveDraftRoleToDB();
    });

    expect(getSentObjectPermission(POLICY_OBJECT_METADATA_ID)).toMatchObject({
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
    expect(getSentRowLevelPermissionInput()).toMatchObject({
      canReadRecords: true,
      canCreateRecords: true,
      canUpdateRecords: true,
      canSoftDeleteRecords: true,
      canDestroyRecords: false,
    });
  });

  it('restores the toggles as object-level grants when the filter is removed', async () => {
    await saveMemberRole({
      ...FOLDED_MEMBER_ROLE,
      rowLevelPermissionPredicates: [],
    });

    expect(getSentObjectPermission(POLICY_OBJECT_METADATA_ID)).toEqual({
      objectMetadataId: POLICY_OBJECT_METADATA_ID,
      canReadObjectRecords: null,
      canUpdateObjectRecords: null,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: null,
      showInSidebar: true,
      editWindowMinutes: 60,
    });
    expect(getSentRowLevelPermissionInput()).toMatchObject({
      objectMetadataId: POLICY_OBJECT_METADATA_ID,
      predicates: [],
      predicateGroups: [],
    });
  });

  it('sends the role-wide edit window and sidebar default when only they change', async () => {
    await saveMemberRole({
      ...FOLDED_MEMBER_ROLE,
      editWindowMinutes: 120,
      showAllObjectsInSidebar: false,
    });

    expect(mockOtherMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          updateRoleInput: {
            id: ROLE_ID,
            update: expect.objectContaining({
              editWindowMinutes: 120,
              showAllObjectsInSidebar: false,
            }),
          },
        },
      }),
    );
    expect(mockUpsertObjectPermissions).not.toHaveBeenCalled();
  });

  it('sends a row added next to the Agent is Me hop in one root group with it', async () => {
    const rootPredicateGroupId = 'agent-policy-root-group-id';

    await saveMemberRole({
      ...FOLDED_MEMBER_ROLE,
      rowLevelPermissionPredicates: [
        {
          ...AGENT_IS_ME_PREDICATE,
          rowLevelPermissionPredicateGroupId: rootPredicateGroupId,
        },
        {
          ...AGENT_IS_ME_PREDICATE,
          id: 'policy-status-predicate-id',
          relationFieldMetadataId: null,
          fieldMetadataId: 'policy-status-field-id',
          workspaceMemberFieldMetadataId: null,
          value: 'ACTIVE',
          rowLevelPermissionPredicateGroupId: rootPredicateGroupId,
          positionInRowLevelPermissionPredicateGroup: 1,
        },
      ],
      rowLevelPermissionPredicateGroups: [
        {
          __typename: 'RowLevelPermissionPredicateGroup',
          id: rootPredicateGroupId,
          roleId: ROLE_ID,
          objectMetadataId: POLICY_OBJECT_METADATA_ID,
          parentRowLevelPermissionPredicateGroupId: null,
          logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.AND,
          positionInRowLevelPermissionPredicateGroup: null,
          canReadRecords: false,
          canUpdateRecords: false,
          canSoftDeleteRecords: false,
          canDestroyRecords: false,
        },
      ],
    });

    const { predicates, predicateGroups } = getSentRowLevelPermissionInput();

    // The engine makes one rule per root tree and ORs the rules
    expect(predicateGroups).toEqual([
      expect.objectContaining({
        id: rootPredicateGroupId,
        parentRowLevelPermissionPredicateGroupId: null,
        logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.AND,
      }),
    ]);
    expect(
      predicates.map(
        ({
          rowLevelPermissionPredicateGroupId,
        }: {
          rowLevelPermissionPredicateGroupId: string | null;
        }) => rowLevelPermissionPredicateGroupId,
      ),
    ).toEqual([rootPredicateGroupId, rootPredicateGroupId]);
  });
});
