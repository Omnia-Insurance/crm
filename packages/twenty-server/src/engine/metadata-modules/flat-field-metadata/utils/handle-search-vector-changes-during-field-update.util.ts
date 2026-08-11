import { isDefined } from 'twenty-shared/utils';

import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { findManyFlatEntityByIdInFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/find-many-flat-entity-by-id-in-flat-entity-maps-or-throw.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatSearchFieldMetadata } from 'src/engine/metadata-modules/flat-search-field-metadata/types/flat-search-field-metadata.type';
import { findTsVectorFlatFieldMetadataForObject } from 'src/engine/metadata-modules/flat-search-field-metadata/utils/find-ts-vector-flat-field-metadata-for-object.util';
import {
  buildCustomObjectSearchFieldMetadatasForFields,
  isCustomObjectSearchVectorField,
} from 'src/engine/metadata-modules/search-field-metadata/utils/build-custom-object-search-field-metadatas.util';
import { type UniversalFlatSearchFieldMetadata } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-search-field-metadata.type';

type HandleSearchVectorChangesDuringFieldUpdateArgs = {
  flatObjectMetadata: FlatObjectMetadata;
  fromFlatFieldMetadata: FlatFieldMetadata;
  toFlatFieldMetadata: FlatFieldMetadata;
} & Pick<
  AllFlatEntityMaps,
  'flatFieldMetadataMaps' | 'flatSearchFieldMetadataMaps'
>;

export type SearchVectorFieldUpdateSideEffect = {
  searchFieldMetadatasToCreate: UniversalFlatSearchFieldMetadata[];
  searchFieldMetadatasToDelete: UniversalFlatSearchFieldMetadata[];
};

const EMPTY_SIDE_EFFECT: SearchVectorFieldUpdateSideEffect = {
  searchFieldMetadatasToCreate: [],
  searchFieldMetadatasToDelete: [],
};

// OMNIA: keep a custom object's search vector in sync with the "all active searchable
// fields" rule by adding/removing the field's searchFieldMetadata row when it crosses the
// indexable threshold (activation/deactivation, searchable<->non-searchable type change,
// system toggle). A pure rename keeps the same row — the migration runner re-derives the
// to_tsvector expression from the row, which references the field by id, so no delta is
// needed and a rebuild is triggered automatically by the orchestrator on rename.
export const handleSearchVectorChangesDuringFieldUpdate = ({
  flatObjectMetadata,
  fromFlatFieldMetadata,
  toFlatFieldMetadata,
  flatFieldMetadataMaps,
  flatSearchFieldMetadataMaps,
}: HandleSearchVectorChangesDuringFieldUpdateArgs): SearchVectorFieldUpdateSideEffect => {
  if (!flatObjectMetadata.isCustom || !flatObjectMetadata.isSearchable) {
    return EMPTY_SIDE_EFFECT;
  }

  const wasIndexed = isCustomObjectSearchVectorField(fromFlatFieldMetadata);
  const isIndexed = isCustomObjectSearchVectorField(toFlatFieldMetadata);

  if (wasIndexed === isIndexed) {
    return EMPTY_SIDE_EFFECT;
  }

  const objectSearchFieldMetadatas =
    findManyFlatEntityByIdInFlatEntityMapsOrThrow<FlatSearchFieldMetadata>({
      flatEntityMaps: flatSearchFieldMetadataMaps,
      flatEntityIds: flatObjectMetadata.searchFieldMetadataIds,
    });

  const existingRow = objectSearchFieldMetadatas.find(
    (searchFieldMetadata) =>
      searchFieldMetadata.fieldMetadataId === fromFlatFieldMetadata.id,
  );

  // Field stopped qualifying (deactivated / type no longer searchable): drop its row so it
  // leaves the search vector. The DDL rebuild derives the expression from rows alone, so a
  // stale row would otherwise keep an inactive field indexed.
  if (!isIndexed) {
    return isDefined(existingRow)
      ? {
          searchFieldMetadatasToCreate: [],
          searchFieldMetadatasToDelete: [existingRow],
        }
      : EMPTY_SIDE_EFFECT;
  }

  // Field started qualifying (reactivated): add a row unless one already exists.
  if (isDefined(existingRow)) {
    return EMPTY_SIDE_EFFECT;
  }

  const tsVectorFlatFieldMetadata = findTsVectorFlatFieldMetadataForObject({
    fieldUniversalIdentifiers: flatObjectMetadata.fieldUniversalIdentifiers,
    flatFieldMetadataMaps,
  });

  if (!isDefined(tsVectorFlatFieldMetadata)) {
    return EMPTY_SIDE_EFFECT;
  }

  const startPosition =
    objectSearchFieldMetadatas.reduce(
      (maxPosition, searchFieldMetadata) =>
        Math.max(maxPosition, searchFieldMetadata.position),
      -1,
    ) + 1;

  return {
    searchFieldMetadatasToCreate:
      buildCustomObjectSearchFieldMetadatasForFields({
        flatObjectMetadata,
        candidateFlatFieldMetadatas: [toFlatFieldMetadata],
        tsVectorFlatFieldMetadata,
        startPosition,
      }),
    searchFieldMetadatasToDelete: [],
  };
};
