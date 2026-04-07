import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { isNonEmptyArray } from '@sniptt/guards';
import { produce } from 'immer';
import { type OmniaObjectPermission } from '@/settings/roles/types/OmniaRoleExtensions';

export const getRoleWithUpsertedObjectPermission = (
  role: RoleWithPartialMembers,
  objectPermissionToUpsert: OmniaObjectPermission,
) => {
  return produce(role, (draftRole) => {
    if (!isNonEmptyArray(draftRole.objectPermissions)) {
      draftRole.objectPermissions = [objectPermissionToUpsert];

      return;
    }

    const indexOfExistingObjectPermission =
      draftRole.objectPermissions.findIndex(
        (objectPermissionToFind) =>
          objectPermissionToFind.objectMetadataId ===
          objectPermissionToUpsert.objectMetadataId,
      );

    if (indexOfExistingObjectPermission > -1) {
      draftRole.objectPermissions[indexOfExistingObjectPermission] =
        objectPermissionToUpsert;
    } else {
      draftRole.objectPermissions.push(objectPermissionToUpsert);
    }

    return draftRole;
  });
};
