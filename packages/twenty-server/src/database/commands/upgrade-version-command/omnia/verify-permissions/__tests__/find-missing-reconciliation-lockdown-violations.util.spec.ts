import {
  buildObjectRecordsPermissionsMock,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { findMissingReconciliationLockdownViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-missing-reconciliation-lockdown-violations.util';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

const ADMIN_ROLE = {
  id: VERIFY_PERMISSIONS_IDS.adminRole,
  label: 'Admin',
  universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
};

const MEMBER_ROLE = {
  id: VERIFY_PERMISSIONS_IDS.memberRole,
  label: 'Member',
  universalIdentifier: 'member-role-universal-identifier',
};

const buildDenyObjectPermission = ({
  roleId,
  objectMetadataId,
}: {
  roleId: string;
  objectMetadataId: string;
}) => ({
  roleId,
  objectMetadataId,
  canCreateObjectRecords: false,
  canReadObjectRecords: false,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

const MEMBER_DENY_OBJECT_PERMISSIONS = [
  VERIFY_PERMISSIONS_IDS.reconciliationObject,
  VERIFY_PERMISSIONS_IDS.reviewItemObject,
].map((objectMetadataId) =>
  buildDenyObjectPermission({
    roleId: VERIFY_PERMISSIONS_IDS.memberRole,
    objectMetadataId,
  }),
);

const buildRoleRecordsPermissions = (
  objects: RoleRecordsPermissions['objects'],
): RoleRecordsPermissions => ({
  canReadAllRecords: false,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  objects,
});

describe('findMissingReconciliationLockdownViolations', () => {
  it('should pass when every non-admin role denies every reconciliation object that exists', () => {
    expect(
      findMissingReconciliationLockdownViolations({
        roles: [ADMIN_ROLE, MEMBER_ROLE],
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        objectPermissions: MEMBER_DENY_OBJECT_PERMISSIONS,
        rolesPermissions: {
          [VERIFY_PERMISSIONS_IDS.memberRole]: buildRoleRecordsPermissions({
            [VERIFY_PERMISSIONS_IDS.reconciliationObject]:
              buildObjectRecordsPermissionsMock(),
          }),
        },
      }),
    ).toEqual([]);
  });

  it('should skip workspaces without reconciliation objects', () => {
    expect(
      findMissingReconciliationLockdownViolations({
        roles: [MEMBER_ROLE],
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS.filter(
          ({ nameSingular }) =>
            !['reconciliation', 'reviewItem'].includes(nameSingular),
        ),
        objectPermissions: [],
        rolesPermissions: {},
      }),
    ).toEqual([]);
  });

  it('should report a role missing a deny row or inheriting one operation through a null grant', () => {
    const [reconciliationDenyRow] = MEMBER_DENY_OBJECT_PERMISSIONS;

    expect(
      findMissingReconciliationLockdownViolations({
        roles: [ADMIN_ROLE, MEMBER_ROLE],
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        objectPermissions: [
          { ...reconciliationDenyRow, canCreateObjectRecords: null },
        ],
        rolesPermissions: {},
      }),
    ).toEqual([
      {
        check: 'reconciliation-lockdown',
        message: `role ${VERIFY_PERMISSIONS_IDS.memberRole} has no object permission denying every operation on reconciliation, reviewItem`,
        ids: [
          VERIFY_PERMISSIONS_IDS.memberRole,
          VERIFY_PERMISSIONS_IDS.reconciliationObject,
          VERIFY_PERMISSIONS_IDS.reviewItemObject,
        ],
      },
    ]);
  });

  it('should still require deny rows on a role labelled Admin that is not the standard admin', () => {
    const relabelledRole = {
      ...MEMBER_ROLE,
      label: 'Admin',
    };

    expect(
      findMissingReconciliationLockdownViolations({
        roles: [ADMIN_ROLE, relabelledRole],
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        objectPermissions: [],
        rolesPermissions: {},
      }),
    ).toEqual([
      {
        check: 'reconciliation-lockdown',
        message: `role ${VERIFY_PERMISSIONS_IDS.memberRole} has no object permission denying every operation on reconciliation, reviewItem`,
        ids: [
          VERIFY_PERMISSIONS_IDS.memberRole,
          VERIFY_PERMISSIONS_IDS.reconciliationObject,
          VERIFY_PERMISSIONS_IDS.reviewItemObject,
        ],
      },
    ]);
  });

  it('should report a role whose row level permission rule reaches reconciliation records despite its deny rows', () => {
    expect(
      findMissingReconciliationLockdownViolations({
        roles: [ADMIN_ROLE, MEMBER_ROLE],
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        objectPermissions: MEMBER_DENY_OBJECT_PERMISSIONS,
        rolesPermissions: {
          [VERIFY_PERMISSIONS_IDS.memberRole]: buildRoleRecordsPermissions({
            [VERIFY_PERMISSIONS_IDS.reconciliationObject]:
              buildObjectRecordsPermissionsMock({
                rowLevelRecordsPermissions: [
                  {
                    ruleId: 'reconciliation-rule-id',
                    canCreateRecords: false,
                    canReadRecords: true,
                    canUpdateRecords: false,
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
        },
      }),
    ).toEqual([
      {
        check: 'reconciliation-lockdown',
        message: `role ${VERIFY_PERMISSIONS_IDS.memberRole} reaches reconciliation records through an object grant or a row level permission rule`,
        ids: [
          VERIFY_PERMISSIONS_IDS.memberRole,
          VERIFY_PERMISSIONS_IDS.reconciliationObject,
        ],
      },
    ]);
  });

  it('should report an application grant role copied from the admin role', () => {
    const grantRole = {
      id: 'twenty-standard-grant-role-id',
      label: 'Twenty Standard',
      universalIdentifier: 'twenty-standard-grant-role-universal-identifier',
    };
    const fullAccess = buildObjectRecordsPermissionsMock({
      canCreateAllRecords: true,
      canReadAllRecords: true,
      canUpdateAllRecords: true,
      canSoftDeleteAllRecords: true,
      canDestroyAllRecords: true,
    });

    expect(
      findMissingReconciliationLockdownViolations({
        roles: [ADMIN_ROLE, grantRole],
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        objectPermissions: [],
        rolesPermissions: {
          [grantRole.id]: buildRoleRecordsPermissions({
            [VERIFY_PERMISSIONS_IDS.reconciliationObject]: fullAccess,
            [VERIFY_PERMISSIONS_IDS.reviewItemObject]: fullAccess,
          }),
        },
      }).map(({ message }) => message),
    ).toEqual([
      `role ${grantRole.id} has no object permission denying every operation on reconciliation, reviewItem`,
      `role ${grantRole.id} reaches reconciliation, reviewItem records through an object grant or a row level permission rule`,
    ]);
  });
});
