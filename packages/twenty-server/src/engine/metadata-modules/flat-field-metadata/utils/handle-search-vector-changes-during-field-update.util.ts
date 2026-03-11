import { type FieldMetadataType } from 'twenty-shared/types';
import { findOrThrow } from 'twenty-shared/utils';

import {
  FieldMetadataException,
  FieldMetadataExceptionCode,
} from 'src/engine/metadata-modules/field-metadata/field-metadata.exception';
import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { findManyFlatEntityByIdInFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/find-many-flat-entity-by-id-in-flat-entity-maps-or-throw.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { SEARCH_VECTOR_FIELD } from 'src/engine/metadata-modules/search-field-metadata/constants/search-vector-field.constants';
import { buildCustomObjectSearchVectorFieldSettings } from 'src/engine/metadata-modules/search-field-metadata/utils/build-custom-object-search-vector-field-settings.util';

type HandleSearchVectorChangesDuringFieldUpdateArgs = {
  flatObjectMetadata: FlatObjectMetadata;
  fromFlatFieldMetadata: FlatFieldMetadata;
  toFlatFieldMetadata: FlatFieldMetadata;
} & Pick<AllFlatEntityMaps, 'flatFieldMetadataMaps'>;

export const handleSearchVectorChangesDuringFieldUpdate = ({
  flatObjectMetadata,
  fromFlatFieldMetadata,
  toFlatFieldMetadata,
  flatFieldMetadataMaps,
}: HandleSearchVectorChangesDuringFieldUpdateArgs):
  | FlatFieldMetadata<FieldMetadataType.TS_VECTOR>
  | undefined => {
  const affectsSearchVector =
    fromFlatFieldMetadata.name !== toFlatFieldMetadata.name ||
    fromFlatFieldMetadata.type !== toFlatFieldMetadata.type ||
    fromFlatFieldMetadata.isActive !== toFlatFieldMetadata.isActive ||
    fromFlatFieldMetadata.isSystem !== toFlatFieldMetadata.isSystem;

  if (
    !affectsSearchVector ||
    !flatObjectMetadata.isCustom ||
    !flatObjectMetadata.isSearchable
  ) {
    return undefined;
  }

  const objectFlatFieldMetadatas =
    findManyFlatEntityByIdInFlatEntityMapsOrThrow({
      flatEntityMaps: flatFieldMetadataMaps,
      flatEntityIds: flatObjectMetadata.fieldIds,
    });

  const searchVectorField = findOrThrow(
    objectFlatFieldMetadatas,
    (field) => field.name === SEARCH_VECTOR_FIELD.name,
    new FieldMetadataException(
      `Search vector field not found for object metadata ${flatObjectMetadata.id}`,
      FieldMetadataExceptionCode.FIELD_METADATA_NOT_FOUND,
    ),
  ) as FlatFieldMetadata<FieldMetadataType.TS_VECTOR>;

  const updatedObjectFields = objectFlatFieldMetadatas.map((field) =>
    field.id === fromFlatFieldMetadata.id ? toFlatFieldMetadata : field,
  );

  return {
    ...searchVectorField,
    universalSettings: {
      ...searchVectorField.universalSettings,
      ...buildCustomObjectSearchVectorFieldSettings(updatedObjectFields),
    },
  };
};
