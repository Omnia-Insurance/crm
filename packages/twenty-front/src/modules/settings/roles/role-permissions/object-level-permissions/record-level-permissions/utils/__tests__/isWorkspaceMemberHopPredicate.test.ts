import { isWorkspaceMemberHopPredicate } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/isWorkspaceMemberHopPredicate';
import {
  AGENT_PROFILE_MANAGER_FIELD_METADATA_ID,
  buildPolicyAgentHopPredicate,
  POLICY_AGENT_FIELD_METADATA_ID,
  WORKSPACE_MEMBER_HOP_TEST_METADATA,
  WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/workspaceMemberHopTestMetadata';
import { RowLevelPermissionPredicateOperand } from '~/generated-metadata/graphql';

const isHop = (predicate: ReturnType<typeof buildPolicyAgentHopPredicate>) =>
  isWorkspaceMemberHopPredicate({
    predicate,
    ...WORKSPACE_MEMBER_HOP_TEST_METADATA,
  });

describe('isWorkspaceMemberHopPredicate', () => {
  it('matches the C2 "Agent is Me" hop', () => {
    expect(isHop(buildPolicyAgentHopPredicate())).toBe(true);
  });

  it('matches the same hop with "is not"', () => {
    expect(
      isHop(
        buildPolicyAgentHopPredicate({
          operand: RowLevelPermissionPredicateOperand.IS_NOT,
        }),
      ),
    ).toBe(true);
  });

  it('leaves a hop through another agentProfile field alone', () => {
    expect(
      isHop(
        buildPolicyAgentHopPredicate({
          fieldMetadataId: AGENT_PROFILE_MANAGER_FIELD_METADATA_ID,
        }),
      ),
    ).toBe(false);
  });

  it('leaves hops with a value or sub-fields alone', () => {
    expect(isHop(buildPolicyAgentHopPredicate({ value: ['x'] }))).toBe(false);
    expect(
      isHop(buildPolicyAgentHopPredicate({ subFieldName: 'firstName' })),
    ).toBe(false);
    expect(
      isHop(
        buildPolicyAgentHopPredicate({
          workspaceMemberSubFieldName: 'firstName',
        }),
      ),
    ).toBe(false);
  });

  it('leaves hops compared with another workspace member field alone', () => {
    expect(
      isHop(
        buildPolicyAgentHopPredicate({
          workspaceMemberFieldMetadataId: 'another-workspace-member-field-id',
        }),
      ),
    ).toBe(false);
  });

  it('does not treat the legacy direct comparison as a hop', () => {
    expect(
      isHop(
        buildPolicyAgentHopPredicate({
          relationFieldMetadataId: null,
          fieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
          workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
        }),
      ),
    ).toBe(false);
  });
});
