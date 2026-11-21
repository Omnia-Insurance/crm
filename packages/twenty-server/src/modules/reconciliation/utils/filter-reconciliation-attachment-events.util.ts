import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type ObjectRecordEvent } from 'twenty-shared/database-events';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type PermissionsMetadataMaps } from 'src/engine/permissions/internal/combine/types/row-access-policy.type';
import { buildRecordReadRestrictions } from 'src/engine/permissions/internal/role/utils/build-record-read-restrictions.util';
import { getPermissionsPrincipalsRecordsPermissions } from 'src/engine/permissions/internal/role/utils/get-permissions-principals-records-permissions.util';
import { type PermissionsPrincipalsWithRolesContext } from 'src/engine/permissions/principal/types/permissions-principals-with-roles-context.type';
import { findUnreadableReconciliationTargetColumnNames } from 'src/modules/reconciliation/utils/restrict-reconciliation-attachments.util';

// Events skip the query runners' attachment restriction, so a carrier book-of-business attachment event (file
// name and ids, PHI) is dropped for a reader who cannot read the reconciliation objects; snapshots are full rows.
export const filterReconciliationAttachmentEvents = <
  TEvent extends ObjectRecordEvent,
>({
  events,
  objectMetadata,
  principals,
  metadataMaps,
}: {
  events: TEvent[];
  objectMetadata: Pick<FlatObjectMetadata, 'universalIdentifier'>;
  principals: PermissionsPrincipalsWithRolesContext;
  metadataMaps: PermissionsMetadataMaps;
}): TEvent[] => {
  if (
    objectMetadata.universalIdentifier !==
      STANDARD_OBJECTS.attachment.universalIdentifier ||
    events.length === 0
  ) {
    return events;
  }

  const targetColumnNames = findUnreadableReconciliationTargetColumnNames({
    recordReadRestrictions: buildRecordReadRestrictions({
      recordsPermissions: getPermissionsPrincipalsRecordsPermissions({
        principals,
        metadataMaps,
      }),
    }),
    flatObjectMetadataMaps: metadataMaps.flatObjectMetadataMaps,
    flatFieldMetadataMaps: metadataMaps.flatFieldMetadataMaps,
  });

  if (targetColumnNames.length === 0) {
    return events;
  }

  return events.filter(({ properties }) =>
    [
      'before' in properties ? properties.before : undefined,
      'after' in properties ? properties.after : undefined,
    ]
      .filter(isPlainObject)
      .every((attachment) =>
        targetColumnNames.every(
          (targetColumnName) => !isDefined(attachment[targetColumnName]),
        ),
      ),
  );
};
