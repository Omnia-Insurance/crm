import { isDefined } from 'twenty-shared/utils';

import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldPermissionMaps } from 'src/engine/metadata-modules/flat-field-permission/types/flat-field-permission-maps.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatSearchFieldMetadataMaps } from 'src/engine/metadata-modules/flat-search-field-metadata/types/flat-search-field-metadata-maps.type';

// Search matches the searchVector column, which carries no permission of the fields it indexes, so a role can find
// records by a value it cannot read. The engine never hides a label identifier, so a restriction on one hides nothing.
export const findReadRestrictedSearchableFieldViolations = ({
  flatSearchFieldMetadataMaps,
  flatFieldPermissionMaps,
  flatObjectMetadataMaps,
}: {
  flatSearchFieldMetadataMaps: FlatSearchFieldMetadataMaps;
  flatFieldPermissionMaps: FlatFieldPermissionMaps;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
}): OmniaPermissionsViolation[] => {
  const readRestrictedFieldMetadataIds = new Set(
    Object.values(flatFieldPermissionMaps.byUniversalIdentifier)
      .filter(isDefined)
      .filter(({ canReadFieldValue }) => canReadFieldValue === false)
      .map(({ fieldMetadataId }) => fieldMetadataId),
  );

  const readRestrictedSearchableFieldMetadataIds = [
    ...new Set(
      Object.values(flatSearchFieldMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .filter(
          ({ objectMetadataId, fieldMetadataId }) =>
            readRestrictedFieldMetadataIds.has(fieldMetadataId) &&
            findFlatEntityByIdInFlatEntityMaps({
              flatEntityId: objectMetadataId,
              flatEntityMaps: flatObjectMetadataMaps,
            })?.labelIdentifierFieldMetadataId !== fieldMetadataId,
        )
        .map(({ fieldMetadataId }) => fieldMetadataId),
    ),
  ];

  return readRestrictedSearchableFieldMetadataIds.length > 0
    ? [
        {
          check: OMNIA_PERMISSIONS_CHECK.readRestrictedSearchableField,
          message: `${readRestrictedSearchableFieldMetadataIds.length} searchable field(s) that some role cannot read: search matches searchVector in WHERE, so that role can find records by the hidden value; remove the field from search or lift the restriction`,
          ids: readRestrictedSearchableFieldMetadataIds,
        },
      ]
    : [];
};
