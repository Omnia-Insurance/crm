import { type ObjectRecordsPermissions } from 'twenty-shared/types';

import {
  buildObjectRecordsPermissionsMock,
  buildRulePredicateMock,
  MEMBER_POLICY_HOP_PREDICATE_MOCK,
  VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { findRelationHopTargetWriteViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-relation-hop-target-write-violations.util';

type FindArgs = Parameters<typeof findRelationHopTargetWriteViolations>[0];

const buildArgs = ({
  agentProfileObjectRecordsPermissions,
  predicates = [MEMBER_POLICY_HOP_PREDICATE_MOCK],
}: {
  agentProfileObjectRecordsPermissions?: ObjectRecordsPermissions;
  predicates?: FindArgs['predicates'];
}): FindArgs => ({
  predicates,
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
          buildObjectRecordsPermissionsMock({
            canReadAllRecords: true,
            canUpdateAllRecords: true,
          }),
        [VERIFY_PERMISSIONS_IDS.agentProfileObject]:
          agentProfileObjectRecordsPermissions ??
          buildObjectRecordsPermissionsMock({ canReadAllRecords: true }),
      },
    },
  },
});

const findCheckMessages = (args: FindArgs) =>
  findRelationHopTargetWriteViolations(args).map(({ check, message }) => ({
    check,
    message,
  }));

describe('findRelationHopTargetWriteViolations', () => {
  it('should pass a role that reads agent profiles without changing them', () => {
    expect(findRelationHopTargetWriteViolations(buildArgs({}))).toEqual([]);
  });

  it('should ignore predicates without a relation hop, even on an object the role writes', () => {
    expect(
      findRelationHopTargetWriteViolations(
        buildArgs({
          agentProfileObjectRecordsPermissions:
            buildObjectRecordsPermissionsMock({
              canUpdateAllRecords: true,
              canSoftDeleteAllRecords: true,
            }),
          predicates: [buildRulePredicateMock({ id: 'status-predicate-id' })],
        }),
      ),
    ).toEqual([]);
  });

  it('should fail when the role can repoint a colleague profile to itself', () => {
    const violations = findRelationHopTargetWriteViolations(
      buildArgs({
        agentProfileObjectRecordsPermissions: buildObjectRecordsPermissionsMock(
          { canReadAllRecords: true, canUpdateAllRecords: true },
        ),
      }),
    );

    expect(violations).toEqual([
      {
        check: 'relation-hop-target-write',
        message: expect.stringContaining(
          'can edit agentProfile.workspaceMember',
        ),
        ids: [
          VERIFY_PERMISSIONS_IDS.memberRole,
          VERIFY_PERMISSIONS_IDS.agentProfileObject,
          VERIFY_PERMISSIONS_IDS.memberPolicyHopPredicate,
        ],
      },
    ]);
  });

  it('should pass an update grant when the hop member field is read-only for the role', () => {
    expect(
      findRelationHopTargetWriteViolations(
        buildArgs({
          agentProfileObjectRecordsPermissions:
            buildObjectRecordsPermissionsMock({
              canReadAllRecords: true,
              canUpdateAllRecords: true,
              uneditableFields: [
                VERIFY_PERMISSIONS_IDS.agentProfileWorkspaceMemberField,
              ],
            }),
        }),
      ),
    ).toEqual([]);
  });

  it('should fail when a rule lets the role edit the hop member field on some profiles', () => {
    expect(
      findCheckMessages(
        buildArgs({
          agentProfileObjectRecordsPermissions:
            buildObjectRecordsPermissionsMock({
              canReadAllRecords: true,
              rowLevelRecordsPermissions: [
                {
                  ruleId: 'own-profile-rule-id',
                  canCreateRecords: false,
                  canReadRecords: false,
                  canUpdateRecords: true,
                  canSoftDeleteRecords: false,
                  canDestroyRecords: false,
                  predicates: [],
                  predicateGroups: [],
                  unreadableFields: [],
                  uneditableFields: [],
                },
              ],
            }),
        }),
      ),
    ).toEqual([
      {
        check: 'relation-hop-target-write',
        message: expect.stringContaining(
          'can edit agentProfile.workspaceMember',
        ),
      },
    ]);
  });

  it('should fail when the role can remove the profiles its hop resolves through', () => {
    expect(
      findCheckMessages(
        buildArgs({
          agentProfileObjectRecordsPermissions:
            buildObjectRecordsPermissionsMock({
              canReadAllRecords: true,
              canSoftDeleteAllRecords: true,
              canDestroyAllRecords: true,
            }),
        }),
      ),
    ).toEqual([
      {
        check: 'relation-hop-target-write',
        message: expect.stringContaining(
          'can softDelete, destroy agentProfile records',
        ),
      },
    ]);
  });

  it('should report each role and hop target once, with every predicate through it', () => {
    const leadHopPredicate = {
      ...MEMBER_POLICY_HOP_PREDICATE_MOCK,
      id: 'lead-hop-predicate-id',
    };

    const violations = findRelationHopTargetWriteViolations(
      buildArgs({
        agentProfileObjectRecordsPermissions: buildObjectRecordsPermissionsMock(
          { canReadAllRecords: true, canUpdateAllRecords: true },
        ),
        predicates: [MEMBER_POLICY_HOP_PREDICATE_MOCK, leadHopPredicate],
      }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].ids).toEqual([
      VERIFY_PERMISSIONS_IDS.memberRole,
      VERIFY_PERMISSIONS_IDS.agentProfileObject,
      VERIFY_PERMISSIONS_IDS.memberPolicyHopPredicate,
      'lead-hop-predicate-id',
    ]);
  });
});
