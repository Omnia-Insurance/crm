import { type FieldMetadataType } from 'twenty-shared/types';
import {
  isSearchableFieldType,
  type SearchableFieldType,
} from 'twenty-shared/utils';

import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { buildFlatSearchFieldMetadataForField } from 'src/engine/metadata-modules/flat-search-field-metadata/utils/build-flat-search-field-metadata-for-field.util';
import { SEARCH_VECTOR_FIELD } from 'src/engine/metadata-modules/search-field-metadata/constants/search-vector-field.constants';
import { type UniversalFlatSearchFieldMetadata } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-search-field-metadata.type';

type CustomObjectSearchVectorSourceField = {
  name: string;
  type: FieldMetadataType;
  isActive?: boolean | null;
  isSystem?: boolean | null;
};

// OMNIA: custom objects index EVERY active, searchable, non-system field in their search
// vector (upstream indexes only the label-identifier field). This predicate is the single
// source of truth for which fields earn a searchFieldMetadata row — it is reused both at
// query time (global search) and at DDL time (building the searchFieldMetadata rows the
// migration runner derives the to_tsvector expression from).
export const isCustomObjectSearchVectorField = <
  T extends CustomObjectSearchVectorSourceField,
>(
  field: T,
): field is T & { type: SearchableFieldType } =>
  field.name !== SEARCH_VECTOR_FIELD.name &&
  field.isActive !== false &&
  field.isSystem !== true &&
  isSearchableFieldType(field.type);

// Query-time helper (used by global search) returning the searchable {name, type} fields.
export const getCustomObjectSearchVectorFields = (
  fields: CustomObjectSearchVectorSourceField[],
) =>
  fields
    .filter(isCustomObjectSearchVectorField)
    .map(({ name, type }) => ({ name, type }));

// Builds one searchFieldMetadata row per qualifying field, assigning sequential positions
// from `startPosition`. Returns UniversalFlatSearchFieldMetadata rows ready for the
// migration runner, which rebuilds the searchVector to_tsvector expression from them.
export const buildCustomObjectSearchFieldMetadatasForFields = <
  T extends CustomObjectSearchVectorSourceField & {
    universalIdentifier: string;
  },
>({
  flatObjectMetadata,
  candidateFlatFieldMetadatas,
  tsVectorFlatFieldMetadata,
  startPosition,
}: {
  flatObjectMetadata: Pick<
    FlatObjectMetadata,
    'applicationUniversalIdentifier' | 'universalIdentifier'
  >;
  candidateFlatFieldMetadatas: T[];
  tsVectorFlatFieldMetadata: { universalIdentifier: string };
  startPosition: number;
}): UniversalFlatSearchFieldMetadata[] =>
  candidateFlatFieldMetadatas
    .filter(isCustomObjectSearchVectorField)
    .map((flatFieldMetadata, index) =>
      buildFlatSearchFieldMetadataForField({
        flatObjectMetadata,
        flatFieldMetadata,
        tsVectorFlatFieldMetadata,
        position: startPosition + index,
      }),
    );
