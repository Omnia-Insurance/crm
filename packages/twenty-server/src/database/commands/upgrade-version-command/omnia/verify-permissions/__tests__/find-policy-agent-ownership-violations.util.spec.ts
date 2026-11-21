import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import { RowLevelPermissionPredicateOperand } from 'twenty-shared/types';

import {
  buildObjectRecordsPermissionsMock,
  buildRuleMock,
  buildRulePredicateMock,
  MEMBER_POLICY_HOP_PREDICATE_MOCK,
  MEMBER_POLICY_RULE_MOCK,
  VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/brokerage-agent-role-universal-identifier.constant';
import { findPolicyAgentOwnershipViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-policy-agent-ownership-violations.util';

type FindArgs = Parameters<typeof findPolicyAgentOwnershipViolations>[0];

const MEMBER_ROLE = {
  id: VERIFY_PERMISSIONS_IDS.memberRole,
  universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
};

const SETTINGS_ROOT_GROUP_ID = 'settings-root-group-id';

const buildArgs = (overrides: Partial<FindArgs> = {}): FindArgs => ({
  roles: [MEMBER_ROLE],
  objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
  rules: [MEMBER_POLICY_RULE_MOCK],
  predicates: [MEMBER_POLICY_HOP_PREDICATE_MOCK],
  predicateGroups: [],
  flatFieldMetadataMaps: VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
  flatObjectMetadataMaps: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  rolesPermissions: {
    [VERIFY_PERMISSIONS_IDS.memberRole]: {
      canReadAllRecords: true,
      canUpdateAllRecords: true,
      canSoftDeleteAllRecords: true,
      canDestroyAllRecords: true,
      objects: {
        [VERIFY_PERMISSIONS_IDS.policyObject]:
          buildObjectRecordsPermissionsMock({ canReadAllRecords: true }),
      },
    },
  },
  featureFlagsMap: {},
  ...overrides,
});

describe('findPolicyAgentOwnershipViolations', () => {
  it('should pass Member reading every policy and writing through the agent relation hop only', () => {
    expect(findPolicyAgentOwnershipViolations(buildArgs())).toEqual([]);
  });

  it('should skip a workspace without policy and a Brokerage Agent role that is not installed', () => {
    expect(
      findPolicyAgentOwnershipViolations(
        buildArgs({
          objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS.filter(
            ({ nameSingular }) => nameSingular !== 'policy',
          ),
          rules: [],
        }),
      ),
    ).toEqual([]);
  });

  it('should report Member writing every policy through the object grant and reading only some', () => {
    const messages = findPolicyAgentOwnershipViolations(
      buildArgs({
        rolesPermissions: {
          [VERIFY_PERMISSIONS_IDS.memberRole]: {
            canReadAllRecords: true,
            canUpdateAllRecords: true,
            canSoftDeleteAllRecords: true,
            canDestroyAllRecords: true,
            objects: {
              [VERIFY_PERMISSIONS_IDS.policyObject]:
                buildObjectRecordsPermissionsMock({
                  canUpdateAllRecords: true,
                }),
            },
          },
        },
      }),
    ).map(({ message }) => message);

    expect(messages).toEqual([
      `Member role ${VERIFY_PERMISSIONS_IDS.memberRole} on policy: read must reach every policy through the object grant`,
      `Member role ${VERIFY_PERMISSIONS_IDS.memberRole} on policy: update reaches every policy through the object grant instead of the agent rule`,
    ]);
  });

  it('should report a Brokerage Agent role without any rule granting update', () => {
    const agentRole = {
      id: VERIFY_PERMISSIONS_IDS.agentRole,
      universalIdentifier: BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
    };

    expect(
      findPolicyAgentOwnershipViolations(
        buildArgs({
          roles: [MEMBER_ROLE, agentRole],
          rolesPermissions: {
            ...buildArgs().rolesPermissions,
            [agentRole.id]: {
              canReadAllRecords: true,
              canUpdateAllRecords: false,
              canSoftDeleteAllRecords: false,
              canDestroyAllRecords: false,
              objects: {
                [VERIFY_PERMISSIONS_IDS.policyObject]:
                  buildObjectRecordsPermissionsMock({
                    canReadAllRecords: true,
                  }),
              },
            },
          },
        }),
      ).map(({ message }) => message),
    ).toEqual([
      `Brokerage Agent role ${agentRole.id} on policy: no row level permission rule grants update, so agents cannot update their own policies`,
    ]);
  });

  it('should pass the hop inside the AND root group the settings editor writes', () => {
    expect(
      findPolicyAgentOwnershipViolations(
        buildArgs({
          predicates: [
            {
              ...MEMBER_POLICY_HOP_PREDICATE_MOCK,
              rowLevelPermissionPredicateGroupId: SETTINGS_ROOT_GROUP_ID,
            },
          ],
          predicateGroups: [
            {
              id: SETTINGS_ROOT_GROUP_ID,
              rowLevelPermissionRuleId: MEMBER_POLICY_RULE_MOCK.id,
              parentRowLevelPermissionPredicateGroupId: null,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('should pass an ungrouped hop beside an empty group of the same rule', () => {
    expect(
      findPolicyAgentOwnershipViolations(
        buildArgs({
          predicateGroups: [
            {
              id: SETTINGS_ROOT_GROUP_ID,
              rowLevelPermissionRuleId: MEMBER_POLICY_RULE_MOCK.id,
              parentRowLevelPermissionPredicateGroupId: null,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('should report a hop whose group hangs off a group of another rule', () => {
    const violations = findPolicyAgentOwnershipViolations(
      buildArgs({
        predicates: [
          {
            ...MEMBER_POLICY_HOP_PREDICATE_MOCK,
            rowLevelPermissionPredicateGroupId: SETTINGS_ROOT_GROUP_ID,
          },
        ],
        predicateGroups: [
          {
            id: SETTINGS_ROOT_GROUP_ID,
            rowLevelPermissionRuleId: MEMBER_POLICY_RULE_MOCK.id,
            parentRowLevelPermissionPredicateGroupId: 'other-rule-group-id',
          },
          {
            id: 'other-rule-group-id',
            rowLevelPermissionRuleId: 'other-rule-id',
            parentRowLevelPermissionPredicateGroupId: null,
          },
        ],
      }),
    );

    expect(violations.map(({ message }) => message)).toEqual([
      expect.stringContaining(
        'rule(s) granting update must hold only the policy.agent -> agentProfile.workspaceMember relation hop predicate',
      ),
    ]);
  });

  it('should report soft delete and destroy reaching every policy through the object grant', () => {
    const messages = findPolicyAgentOwnershipViolations(
      buildArgs({
        rolesPermissions: {
          [VERIFY_PERMISSIONS_IDS.memberRole]: {
            canReadAllRecords: true,
            canUpdateAllRecords: false,
            canSoftDeleteAllRecords: true,
            canDestroyAllRecords: true,
            objects: {
              [VERIFY_PERMISSIONS_IDS.policyObject]:
                buildObjectRecordsPermissionsMock({
                  canReadAllRecords: true,
                  canSoftDeleteAllRecords: true,
                  canDestroyAllRecords: true,
                }),
            },
          },
        },
      }),
    ).map(({ message }) => message);

    expect(messages).toEqual([
      `Member role ${VERIFY_PERMISSIONS_IDS.memberRole} on policy: softDelete reaches every policy through the object grant instead of the agent rule`,
      `Member role ${VERIFY_PERMISSIONS_IDS.memberRole} on policy: destroy reaches every policy through the object grant instead of the agent rule`,
    ]);
  });

  it('should report a rule granting update whose predicate is not the agent relation hop', () => {
    const statusRule = buildRuleMock({
      id: 'status-rule-id',
      canUpdateRecords: true,
    });
    const reversedHopPredicate = {
      ...MEMBER_POLICY_HOP_PREDICATE_MOCK,
      operand: RowLevelPermissionPredicateOperand.IS_NOT,
    };

    const violations = findPolicyAgentOwnershipViolations(
      buildArgs({
        rules: [MEMBER_POLICY_RULE_MOCK, statusRule],
        predicates: [
          reversedHopPredicate,
          buildRulePredicateMock({
            id: 'status-predicate-id',
            rowLevelPermissionRuleId: statusRule.id,
          }),
        ],
      }),
    );

    expect(violations).toEqual([
      {
        check: 'policy-agent-ownership',
        message: `Member role ${VERIFY_PERMISSIONS_IDS.memberRole} on policy: rule(s) granting update must hold only the policy.agent -> agentProfile.workspaceMember relation hop predicate`,
        ids: [
          VERIFY_PERMISSIONS_IDS.memberRole,
          VERIFY_PERMISSIONS_IDS.policyObject,
          MEMBER_POLICY_RULE_MOCK.id,
          statusRule.id,
        ],
      },
    ]);
  });
});
