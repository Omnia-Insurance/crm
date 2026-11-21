import { canReachSomeRecords, isDefined } from 'twenty-shared/utils';

import { OBJECT_RECORDS_OPERATION_TYPES } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/object-records-operation-types.constant';
import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { RECONCILIATION_OBJECT_NAME_SINGULARS } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/reconciliation-object-name-singulars.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

type ObjectPermissionGrants = Pick<
  FlatObjectPermission,
  | 'canCreateObjectRecords'
  | 'canReadObjectRecords'
  | 'canUpdateObjectRecords'
  | 'canSoftDeleteObjectRecords'
  | 'canDestroyObjectRecords'
>;

// A null grant inherits the role-wide default, so only an explicit false on every operation keeps the role out
const isDenyingEveryOperation = (
  objectPermission: ObjectPermissionGrants | undefined,
): boolean =>
  isDefined(objectPermission) &&
  objectPermission.canCreateObjectRecords === false &&
  objectPermission.canReadObjectRecords === false &&
  objectPermission.canUpdateObjectRecords === false &&
  objectPermission.canSoftDeleteObjectRecords === false &&
  objectPermission.canDestroyObjectRecords === false;

// Same roles as the reconciliation lockdown: every role but the standard admin, matched by identifier
// so a role relabelled "Admin" cannot opt out
export const findMissingReconciliationLockdownViolations = ({
  roles,
  objectMetadatas,
  objectPermissions,
  rolesPermissions,
}: {
  roles: Pick<FlatRole, 'id' | 'universalIdentifier'>[];
  objectMetadatas: Pick<FlatObjectMetadata, 'id' | 'nameSingular'>[];
  objectPermissions: (Pick<
    FlatObjectPermission,
    'roleId' | 'objectMetadataId'
  > &
    ObjectPermissionGrants)[];
  rolesPermissions: Record<string, RoleRecordsPermissions>;
}): OmniaPermissionsViolation[] => {
  const reconciliationObjectMetadatas = objectMetadatas.filter(
    ({ nameSingular }) =>
      RECONCILIATION_OBJECT_NAME_SINGULARS.includes(nameSingular),
  );

  if (reconciliationObjectMetadatas.length === 0) {
    return [];
  }

  const objectPermissionByRoleAndObject = new Map(
    objectPermissions.map((objectPermission) => [
      `${objectPermission.roleId}:${objectPermission.objectMetadataId}`,
      objectPermission,
    ]),
  );

  return roles
    .filter(
      ({ universalIdentifier }) =>
        universalIdentifier !== STANDARD_ROLE.admin.universalIdentifier,
    )
    .flatMap((role) => {
      const unlockedObjectMetadatas = reconciliationObjectMetadatas.filter(
        (objectMetadata) =>
          !isDenyingEveryOperation(
            objectPermissionByRoleAndObject.get(
              `${role.id}:${objectMetadata.id}`,
            ),
          ),
      );
      // A v2.58 rule grants on its own, so deny rows alone no longer keep a role out
      const reachedObjectMetadatas = reconciliationObjectMetadatas.filter(
        (objectMetadata) =>
          OBJECT_RECORDS_OPERATION_TYPES.some((operationType) =>
            canReachSomeRecords({
              objectRecordsPermissions:
                rolesPermissions[role.id]?.objects[objectMetadata.id],
              operationType,
            }),
          ),
      );

      return [
        ...(unlockedObjectMetadatas.length > 0
          ? [
              {
                check: OMNIA_PERMISSIONS_CHECK.reconciliationLockdown,
                message: `role ${role.id} has no object permission denying every operation on ${unlockedObjectMetadatas.map(({ nameSingular }) => nameSingular).join(', ')}`,
                ids: [role.id, ...unlockedObjectMetadatas.map(({ id }) => id)],
              },
            ]
          : []),
        ...(reachedObjectMetadatas.length > 0
          ? [
              {
                check: OMNIA_PERMISSIONS_CHECK.reconciliationLockdown,
                message: `role ${role.id} reaches ${reachedObjectMetadatas.map(({ nameSingular }) => nameSingular).join(', ')} records through an object grant or a row level permission rule`,
                ids: [role.id, ...reachedObjectMetadatas.map(({ id }) => id)],
              },
            ]
          : []),
      ];
    });
};
