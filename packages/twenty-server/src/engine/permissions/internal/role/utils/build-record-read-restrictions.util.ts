/* @license Enterprise */

import {
  canReachAllRecords,
  canReachSomeRecords,
  isDefined,
} from 'twenty-shared/utils';

import { type RecordReadRestrictions } from 'src/engine/permissions/types/record-read-restrictions.type';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';

export const buildRecordReadRestrictions = ({
  recordsPermissions,
}: {
  recordsPermissions: Pick<RoleRecordsPermissions, 'objects'>;
}): RecordReadRestrictions => {
  const unreadableObjectMetadataIds = new Set<string>();
  const unreadableFieldMetadataIds = new Set<string>();

  for (const [objectMetadataId, objectRecordsPermissions] of Object.entries(
    recordsPermissions.objects,
  )) {
    if (!isDefined(objectRecordsPermissions)) {
      continue;
    }

    if (
      !canReachSomeRecords({
        objectRecordsPermissions,
        operationType: 'read',
      })
    ) {
      unreadableObjectMetadataIds.add(objectMetadataId);
    }

    // Cached role permissions keep their old shape until the upgrade recomputes them
    for (const fieldMetadataId of objectRecordsPermissions.unreadableFields ??
      []) {
      unreadableFieldMetadataIds.add(fieldMetadataId);
    }
  }

  // OMNIA-CUSTOM: objects readable only in part, so timeline values can be refused to readers held to row-level rules
  const rowLevelRestrictedObjectMetadataIds = new Set(
    Object.entries(recordsPermissions.objects).flatMap(
      ([objectMetadataId, objectRecordsPermissions]) =>
        isDefined(objectRecordsPermissions) &&
        !unreadableObjectMetadataIds.has(objectMetadataId) &&
        !canReachAllRecords({ objectRecordsPermissions, operationType: 'read' })
          ? [objectMetadataId]
          : [],
    ),
  );

  return {
    unreadableObjectMetadataIds,
    unreadableFieldMetadataIds,
    rowLevelRestrictedObjectMetadataIds,
  };
};
