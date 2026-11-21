import {
  fromArrayToValuesByKeyRecord,
  isDefined,
  isSearchableFieldType,
} from 'twenty-shared/utils';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntitiesByApplicationId } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entities-by-application-id.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatFieldPermissionMaps } from 'src/engine/metadata-modules/flat-field-permission/types/flat-field-permission-maps.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatSearchFieldMetadata } from 'src/engine/metadata-modules/flat-search-field-metadata/types/flat-search-field-metadata.type';
import { buildFlatSearchFieldMetadataForField } from 'src/engine/metadata-modules/flat-search-field-metadata/utils/build-flat-search-field-metadata-for-field.util';
import { findTsVectorFlatFieldMetadataForObject } from 'src/engine/metadata-modules/flat-search-field-metadata/utils/find-ts-vector-flat-field-metadata-for-object.util';
import { resolveEffectiveFlatEntityProperty } from 'src/engine/metadata-modules/overrides/utils/resolve-effective-flat-entity-property.util';
import { SEARCH_VECTOR_FIELD } from 'src/engine/metadata-modules/search-field-metadata/constants/search-vector-field.constants';
import { type UniversalFlatSearchFieldMetadata } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-search-field-metadata.type';

type BuildOmniaCustomObjectSearchFieldMetadataBackfillOperationsArgs = {
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  flatSearchFieldMetadataMaps: FlatEntityMaps<FlatSearchFieldMetadata>;
  flatFieldPermissionMaps: FlatFieldPermissionMaps;
  customApplicationId: string;
};

type BuildOmniaCustomObjectSearchFieldMetadataBackfillOperationsReturnType = {
  flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier: Record<
    string,
    UniversalFlatSearchFieldMetadata[]
  >;
  readRestrictedFieldCount: number;
};

// Same rule as the create-time isSearchable default, so backfilled and new fields match
const isCustomObjectSearchVectorField = (
  flatFieldMetadata: FlatFieldMetadata,
): boolean =>
  flatFieldMetadata.name !== SEARCH_VECTOR_FIELD.name &&
  resolveEffectiveFlatEntityProperty({
    metadataName: 'fieldMetadata',
    flatEntity: flatFieldMetadata,
    property: 'isActive',
  }) === true &&
  !flatFieldMetadata.isSystem &&
  isSearchableFieldType(flatFieldMetadata.type);

// 2.18 rebuilt every custom-object searchVector from rows that index only `name`; this
// restores the all-searchable-fields surface once, appending after each object's last row.
export const buildOmniaCustomObjectSearchFieldMetadataBackfillOperations = ({
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
  flatSearchFieldMetadataMaps,
  flatFieldPermissionMaps,
  customApplicationId,
}: BuildOmniaCustomObjectSearchFieldMetadataBackfillOperationsArgs): BuildOmniaCustomObjectSearchFieldMetadataBackfillOperationsReturnType => {
  const existingFlatSearchFieldMetadatas = Object.values(
    flatSearchFieldMetadataMaps.byUniversalIdentifier,
  ).filter(isDefined);

  const searchFieldMetadataKeys = new Set(
    existingFlatSearchFieldMetadatas.map(
      ({ objectMetadataId, fieldMetadataId }) =>
        `${objectMetadataId}:${fieldMetadataId}`,
    ),
  );

  // Search matches on searchVector in WHERE, where field permissions never apply, so indexing
  // a field some role cannot read would let that role find records by its hidden value
  const readRestrictedFieldMetadataIds = new Set(
    Object.values(flatFieldPermissionMaps.byUniversalIdentifier)
      .filter(isDefined)
      .filter(({ canReadFieldValue }) => canReadFieldValue === false)
      .map(({ fieldMetadataId }) => fieldMetadataId),
  );

  const maxPositionByObjectMetadataId = new Map<string, number>();

  for (const {
    objectMetadataId,
    position,
  } of existingFlatSearchFieldMetadatas) {
    maxPositionByObjectMetadataId.set(
      objectMetadataId,
      Math.max(
        maxPositionByObjectMetadataId.get(objectMetadataId) ?? -1,
        position,
      ),
    );
  }

  const flatSearchFieldMetadatasToCreate: UniversalFlatSearchFieldMetadata[] =
    [];
  let readRestrictedFieldCount = 0;

  const customApplicationFlatObjectMetadatas = findFlatEntitiesByApplicationId({
    flatEntityMaps: flatObjectMetadataMaps,
    applicationId: customApplicationId,
  });

  for (const flatObjectMetadata of customApplicationFlatObjectMetadatas) {
    if (!flatObjectMetadata.isSearchable) {
      continue;
    }

    const tsVectorFlatFieldMetadata = findTsVectorFlatFieldMetadataForObject({
      fieldUniversalIdentifiers: flatObjectMetadata.fieldUniversalIdentifiers,
      flatFieldMetadataMaps,
    });

    if (!isDefined(tsVectorFlatFieldMetadata)) {
      continue;
    }

    let position =
      (maxPositionByObjectMetadataId.get(flatObjectMetadata.id) ?? -1) + 1;

    const searchableFlatFieldMetadatas =
      flatObjectMetadata.fieldUniversalIdentifiers
        .map(
          (fieldUniversalIdentifier) =>
            flatFieldMetadataMaps.byUniversalIdentifier[
              fieldUniversalIdentifier
            ],
        )
        .filter(isDefined)
        .filter(isCustomObjectSearchVectorField);

    for (const flatFieldMetadata of searchableFlatFieldMetadatas) {
      const searchFieldMetadataKey = `${flatObjectMetadata.id}:${flatFieldMetadata.id}`;

      if (searchFieldMetadataKeys.has(searchFieldMetadataKey)) {
        continue;
      }

      const flatSearchFieldMetadata = buildFlatSearchFieldMetadataForField({
        flatObjectMetadata,
        flatFieldMetadata,
        tsVectorFlatFieldMetadata,
        position,
      });

      // A row left by an earlier partial run keeps its deterministic universal
      // identifier even when upgrade commands recreated its object or field ids.
      if (
        isDefined(
          flatSearchFieldMetadataMaps.byUniversalIdentifier[
            flatSearchFieldMetadata.universalIdentifier
          ],
        )
      ) {
        continue;
      }

      if (readRestrictedFieldMetadataIds.has(flatFieldMetadata.id)) {
        readRestrictedFieldCount += 1;
        continue;
      }

      searchFieldMetadataKeys.add(searchFieldMetadataKey);
      flatSearchFieldMetadatasToCreate.push(flatSearchFieldMetadata);
      position += 1;
    }
  }

  return {
    flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier:
      fromArrayToValuesByKeyRecord({
        array: flatSearchFieldMetadatasToCreate,
        key: 'applicationUniversalIdentifier',
      }),
    readRestrictedFieldCount,
  };
};
