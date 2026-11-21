import { findWorkspaceMemberHop } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/findWorkspaceMemberHop';
import {
  AGENT_PROFILE_MANAGER_FIELD_METADATA_ID,
  AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID,
  POLICY_AGENT_FIELD_METADATA_ID,
  POLICY_ASSIGNEE_FIELD_METADATA_ID,
  POLICY_OBJECT_METADATA_ITEM,
  WORKSPACE_MEMBER_HOP_TEST_METADATA,
  WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/workspaceMemberHopTestMetadata';

describe('findWorkspaceMemberHop', () => {
  it('resolves "Agent is Me" to the hop through agentProfile.workspaceMember', () => {
    expect(
      findWorkspaceMemberHop({
        relationFieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
        ...WORKSPACE_MEMBER_HOP_TEST_METADATA,
      }),
    ).toEqual({
      relationFieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
      fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID,
      workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
    });
  });

  it('never hops through agentProfile.manager', () => {
    expect(
      findWorkspaceMemberHop({
        relationFieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
        ...WORKSPACE_MEMBER_HOP_TEST_METADATA,
      })?.fieldMetadataId,
    ).not.toBe(AGENT_PROFILE_MANAGER_FIELD_METADATA_ID);
  });

  it('keeps a direct relation to workspaceMember as a plain comparison', () => {
    expect(
      findWorkspaceMemberHop({
        relationFieldMetadataId: POLICY_ASSIGNEE_FIELD_METADATA_ID,
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
        ...WORKSPACE_MEMBER_HOP_TEST_METADATA,
      }),
    ).toBeUndefined();
  });

  it('only hops for the Me (User ID) value', () => {
    expect(
      findWorkspaceMemberHop({
        relationFieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
        workspaceMemberFieldMetadataId: null,
        ...WORKSPACE_MEMBER_HOP_TEST_METADATA,
      }),
    ).toBeUndefined();

    expect(
      findWorkspaceMemberHop({
        relationFieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
        workspaceMemberFieldMetadataId: 'another-workspace-member-field-id',
        ...WORKSPACE_MEMBER_HOP_TEST_METADATA,
      }),
    ).toBeUndefined();
  });

  it('returns nothing when the relation is not one of the given fields', () => {
    expect(
      findWorkspaceMemberHop({
        relationFieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
        ...WORKSPACE_MEMBER_HOP_TEST_METADATA,
        fieldMetadataItems: POLICY_OBJECT_METADATA_ITEM.fields.filter(
          (field) => field.id !== POLICY_AGENT_FIELD_METADATA_ID,
        ),
      }),
    ).toBeUndefined();
  });

  it('returns nothing while the workspaceMember id field is unknown', () => {
    expect(
      findWorkspaceMemberHop({
        relationFieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
        ...WORKSPACE_MEMBER_HOP_TEST_METADATA,
        workspaceMemberIdFieldMetadataId: undefined,
      }),
    ).toBeUndefined();
  });
});
