import { fromArrayToValuesByKeyRecord, isDefined } from 'twenty-shared/utils';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntitiesByApplicationId } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entities-by-application-id.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatSearchFieldMetadata } from 'src/engine/metadata-modules/flat-search-field-metadata/types/flat-search-field-metadata.type';
import { buildFlatSearchFieldMetadataForField } from 'src/engine/metadata-modules/flat-search-field-metadata/utils/build-flat-search-field-metadata-for-field.util';
import { findTsVectorFlatFieldMetadataForObject } from 'src/engine/metadata-modules/flat-search-field-metadata/utils/find-ts-vector-flat-field-metadata-for-object.util';
import { isCustomObjectSearchVectorField } from 'src/engine/metadata-modules/search-field-metadata/utils/build-custom-object-search-field-metadatas.util';
import { type UniversalFlatSearchFieldMetadata } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-search-field-metadata.type';

type BuildOmniaCustomObjectSearchFieldMetadataBackfillOperationsArgs = {
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  flatSearchFieldMetadataMaps: FlatEntityMaps<FlatSearchFieldMetadata>;
  customApplicationId: string;
};

type BuildOmniaCustomObjectSearchFieldMetadataBackfillOperationsReturnType = {
  flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier: Record<
    string,
    UniversalFlatSearchFieldMetadata[]
  >;
};

// OMNIA: backfill the "all active searchable fields" search surface for EXISTING custom
// objects. Upstream's 2-16 backfill only seeds the label-identifier (name) row; this adds a
// searchFieldMetadata row for every other active, searchable, non-system field. Custom
// objects only — standard objects keep upstream's SEARCH_FIELDS_FOR_* surface. Idempotent:
// (object, field) pairs that already have a row are skipped, and positions continue from the
// object's current maximum so re-runs after the name-only backfill stay stable.
export const buildOmniaCustomObjectSearchFieldMetadataBackfillOperations = ({
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
  flatSearchFieldMetadataMaps,
  customApplicationId,
}: BuildOmniaCustomObjectSearchFieldMetadataBackfillOperationsArgs): BuildOmniaCustomObjectSearchFieldMetadataBackfillOperationsReturnType => {
  const existingSearchFieldMetadataKeys = new Set(
    Object.values(flatSearchFieldMetadataMaps.byUniversalIdentifier)
      .filter(isDefined)
      .map(
        (searchFieldMetadata) =>
          `${searchFieldMetadata.objectMetadataId}:${searchFieldMetadata.fieldMetadataId}`,
      ),
  );

  const flatSearchFieldMetadatasToCreate: UniversalFlatSearchFieldMetadata[] =
    [];

  const customApplicationFlatObjectMetadatas = findFlatEntitiesByApplicationId({
    flatEntityMaps: flatObjectMetadataMaps,
    applicationId: customApplicationId,
  });

  for (const flatObjectMetadata of customApplicationFlatObjectMetadatas) {
    // Junction objects (skipNameField) are not searchable and must stay so.
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

    const objectFlatFieldMetadatas = flatObjectMetadata.fieldUniversalIdentifiers
      .map(
        (fieldUniversalIdentifier) =>
          flatFieldMetadataMaps.byUniversalIdentifier[fieldUniversalIdentifier],
      )
      .filter(isDefined);

    let nextPosition =
      objectFlatFieldMetadatas.length > 0
        ? Object.values(flatSearchFieldMetadataMaps.byUniversalIdentifier)
            .filter(isDefined)
            .filter(
              (searchFieldMetadata) =>
                searchFieldMetadata.objectMetadataId === flatObjectMetadata.id,
            )
            .reduce(
              (maxPosition, searchFieldMetadata) =>
                Math.max(maxPosition, searchFieldMetadata.position),
              -1,
            ) + 1
        : 0;

    for (const flatFieldMetadata of objectFlatFieldMetadatas) {
      if (!isCustomObjectSearchVectorField(flatFieldMetadata)) {
        continue;
      }

      const searchFieldMetadataKey = `${flatObjectMetadata.id}:${flatFieldMetadata.id}`;

      if (existingSearchFieldMetadataKeys.has(searchFieldMetadataKey)) {
        continue;
      }

      existingSearchFieldMetadataKeys.add(searchFieldMetadataKey);

      flatSearchFieldMetadatasToCreate.push(
        buildFlatSearchFieldMetadataForField({
          flatObjectMetadata,
          flatFieldMetadata,
          tsVectorFlatFieldMetadata,
          position: nextPosition,
        }),
      );

      nextPosition += 1;
    }
  }

  const flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier =
    fromArrayToValuesByKeyRecord({
      array: flatSearchFieldMetadatasToCreate,
      key: 'applicationUniversalIdentifier',
    });

  return {
    flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
  };
};
