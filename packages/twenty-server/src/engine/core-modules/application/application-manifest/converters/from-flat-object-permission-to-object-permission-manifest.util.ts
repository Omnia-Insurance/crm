import { type ObjectPermissionManifest } from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';

import { type UniversalFlatObjectPermission } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-object-permission.type';

export const fromFlatObjectPermissionToObjectPermissionManifest = ({
  flatObjectPermission,
}: {
  flatObjectPermission: UniversalFlatObjectPermission;
}): ObjectPermissionManifest => ({
  universalIdentifier: flatObjectPermission.universalIdentifier,
  objectUniversalIdentifier:
    flatObjectPermission.objectMetadataUniversalIdentifier,
  ...(isDefined(flatObjectPermission.canReadObjectRecords)
    ? { canReadObjectRecords: flatObjectPermission.canReadObjectRecords }
    : {}),
  ...(isDefined(flatObjectPermission.canUpdateObjectRecords)
    ? { canUpdateObjectRecords: flatObjectPermission.canUpdateObjectRecords }
    : {}),
  ...(isDefined(flatObjectPermission.canSoftDeleteObjectRecords)
    ? {
        canSoftDeleteObjectRecords:
          flatObjectPermission.canSoftDeleteObjectRecords,
      }
    : {}),
  ...(isDefined(flatObjectPermission.canDestroyObjectRecords)
    ? { canDestroyObjectRecords: flatObjectPermission.canDestroyObjectRecords }
    : {}),
  // OMNIA-CUSTOM: per-object sidebar visibility and edit window (C3, C4)
  ...(isDefined(flatObjectPermission.showInSidebar)
    ? { showInSidebar: flatObjectPermission.showInSidebar }
    : {}),
  ...(isDefined(flatObjectPermission.editWindowMinutes)
    ? { editWindowMinutes: flatObjectPermission.editWindowMinutes }
    : {}),
});
