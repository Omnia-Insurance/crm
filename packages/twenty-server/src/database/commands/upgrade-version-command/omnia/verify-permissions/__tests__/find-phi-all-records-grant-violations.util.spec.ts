import { FeatureFlagKey } from 'twenty-shared/types';

import {
  buildObjectRecordsPermissionsMock,
  buildRuleMock,
  MEMBER_POLICY_RULE_MOCK,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { findPhiAllRecordsGrantViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-phi-all-records-grant-violations.util';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';

const buildRolesPermissions = (
  objectRecordsPermissionsOverrides: Parameters<
    typeof buildObjectRecordsPermissionsMock
  >[0],
  objectMetadataId: string = VERIFY_PERMISSIONS_IDS.policyObject,
): Record<string, RoleRecordsPermissions> => ({
  [VERIFY_PERMISSIONS_IDS.memberRole]: {
    canReadAllRecords: true,
    canUpdateAllRecords: true,
    canSoftDeleteAllRecords: true,
    canDestroyAllRecords: true,
    objects: {
      [objectMetadataId]: buildObjectRecordsPermissionsMock(
        objectRecordsPermissionsOverrides,
      ),
    },
  },
});

describe('findPhiAllRecordsGrantViolations', () => {
  it('should pass read all with a rule granting only create and update (contract C1)', () => {
    expect(
      findPhiAllRecordsGrantViolations({
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        rules: [MEMBER_POLICY_RULE_MOCK],
        rolesPermissions: buildRolesPermissions({ canReadAllRecords: true }),
        featureFlagsMap: {},
      }),
    ).toEqual([]);
  });

  it('should report an all-records update that overrides the rule granting update', () => {
    expect(
      findPhiAllRecordsGrantViolations({
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        rules: [MEMBER_POLICY_RULE_MOCK],
        rolesPermissions: buildRolesPermissions({
          canReadAllRecords: true,
          canCreateAllRecords: true,
          canUpdateAllRecords: true,
        }),
        featureFlagsMap: {},
      }),
    ).toEqual([
      {
        check: 'phi-all-records-grant',
        message: `role ${VERIFY_PERMISSIONS_IDS.memberRole} reaches every policy record for update through an object-level grant, which overrides its row level permission rule(s)`,
        ids: [
          VERIFY_PERMISSIONS_IDS.memberRole,
          VERIFY_PERMISSIONS_IDS.policyObject,
          MEMBER_POLICY_RULE_MOCK.id,
        ],
      },
    ]);
  });

  it('should count create apart from update once create permissions are enforced', () => {
    const [violation] = findPhiAllRecordsGrantViolations({
      objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
      rules: [MEMBER_POLICY_RULE_MOCK],
      rolesPermissions: buildRolesPermissions({ canCreateAllRecords: true }),
      featureFlagsMap: {
        [FeatureFlagKey.IS_CREATE_RECORDS_PERMISSION_ENABLED]: true,
      },
    });

    expect(violation?.message).toContain('for create through');
  });

  it('should cover reconciliation objects and ignore objects that hold no PHI', () => {
    const reconciliationRule = buildRuleMock({
      id: 'reconciliation-rule-id',
      objectMetadataId: VERIFY_PERMISSIONS_IDS.reconciliationObject,
      canReadRecords: true,
    });
    const agentProfileRule = buildRuleMock({
      id: 'agent-profile-rule-id',
      objectMetadataId: VERIFY_PERMISSIONS_IDS.agentProfileObject,
      canReadRecords: true,
    });

    expect(
      findPhiAllRecordsGrantViolations({
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        rules: [reconciliationRule],
        rolesPermissions: buildRolesPermissions(
          { canReadAllRecords: true },
          VERIFY_PERMISSIONS_IDS.reconciliationObject,
        ),
        featureFlagsMap: {},
      }).map(({ ids }) => ids),
    ).toEqual([
      [
        VERIFY_PERMISSIONS_IDS.memberRole,
        VERIFY_PERMISSIONS_IDS.reconciliationObject,
        reconciliationRule.id,
      ],
    ]);
    expect(
      findPhiAllRecordsGrantViolations({
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        rules: [agentProfileRule],
        rolesPermissions: buildRolesPermissions(
          { canReadAllRecords: true },
          VERIFY_PERMISSIONS_IDS.agentProfileObject,
        ),
        featureFlagsMap: {},
      }),
    ).toEqual([]);
  });
});
