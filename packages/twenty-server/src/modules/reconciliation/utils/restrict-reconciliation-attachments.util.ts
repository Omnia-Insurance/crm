import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type ObjectRecord, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { In, IsNull, Not } from 'typeorm';

import { computeMorphOrRelationFieldJoinColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-morph-or-relation-field-join-column-name.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByUniversalIdentifier } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-universal-identifier.util';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { isMorphOrRelationFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-morph-or-relation-flat-field-metadata.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { getFlatFieldsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/utils/get-flat-fields-for-flat-object-metadata.util';
import { type RecordReadRestrictions } from 'src/engine/permissions/types/record-read-restrictions.type';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { RECONCILIATION_ADMIN_ONLY_OBJECT_NAMES } from 'src/modules/reconciliation/services/object-lockdown.service';

// The attachment columns that point at a reconciliation object the reader cannot read
export const findUnreadableReconciliationTargetColumnNames = ({
  recordReadRestrictions,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
}: {
  recordReadRestrictions: RecordReadRestrictions;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
}): string[] => {
  const unreadableReconciliationObjectMetadataIds = new Set(
    Object.values(flatObjectMetadataMaps.byUniversalIdentifier)
      .filter(isDefined)
      .filter(
        ({ id, nameSingular }) =>
          RECONCILIATION_ADMIN_ONLY_OBJECT_NAMES.includes(nameSingular) &&
          recordReadRestrictions.unreadableObjectMetadataIds.has(id),
      )
      .map(({ id }) => id),
  );

  const attachmentFlatObjectMetadata = findFlatEntityByUniversalIdentifier({
    universalIdentifier: STANDARD_OBJECTS.attachment.universalIdentifier,
    flatEntityMaps: flatObjectMetadataMaps,
  });

  if (
    unreadableReconciliationObjectMetadataIds.size === 0 ||
    !isDefined(attachmentFlatObjectMetadata)
  ) {
    return [];
  }

  return getFlatFieldsFromFlatObjectMetadata(
    attachmentFlatObjectMetadata,
    flatFieldMetadataMaps,
  )
    .filter(isMorphOrRelationFlatFieldMetadata)
    .filter(
      ({ relationTargetObjectMetadataId, settings }) =>
        settings?.relationType === RelationType.MANY_TO_ONE &&
        unreadableReconciliationObjectMetadataIds.has(
          relationTargetObjectMetadataId,
        ),
    )
    .map(({ name }) => computeMorphOrRelationFieldJoinColumnName({ name }));
};

// Reconciliation source files are carrier book-of-business spreadsheets (PHI), stored as attachments: a reader
// that cannot read the reconciliation objects sees them like a restricted message attachment
export const restrictReconciliationAttachments = async ({
  attachments,
  recordReadRestrictions,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
  workspaceId,
  workspaceOrmManager,
}: {
  attachments: ObjectRecord[];
  recordReadRestrictions: RecordReadRestrictions;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  workspaceId: string;
  workspaceOrmManager: WorkspaceOrmManager;
}): Promise<void> => {
  const targetColumnNames = findUnreadableReconciliationTargetColumnNames({
    recordReadRestrictions,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
  });

  if (targetColumnNames.length === 0 || attachments.length === 0) {
    return;
  }

  const attachmentIds = attachments.map(({ id }) => id);

  const restrictedAttachments =
    await workspaceOrmManager.executeInWorkspaceContext(
      async () =>
        // Reads only which attachments point at a reconciliation object; nothing read here reaches the reader
        workspaceOrmManager
          .getRepositoryWithoutPermissionChecks('attachment')
          .find({
            where: targetColumnNames.map((targetColumnName) => ({
              id: In(attachmentIds),
              [targetColumnName]: Not(IsNull()),
            })),
            select: ['id'],
            withDeleted: true,
          }),
      buildSystemAuthContext(workspaceId),
      { lite: true },
    );

  const restrictedAttachmentIds = new Set(
    restrictedAttachments.map(({ id }) => id),
  );

  for (const attachment of attachments) {
    if (!restrictedAttachmentIds.has(attachment.id)) {
      continue;
    }

    if ('name' in attachment) {
      attachment.name = FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
    }

    if ('fullPath' in attachment) {
      attachment.fullPath = FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
    }

    if ('file' in attachment) {
      attachment.file = [];
    }
  }
};
