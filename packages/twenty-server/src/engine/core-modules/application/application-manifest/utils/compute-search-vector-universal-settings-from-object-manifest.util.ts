import { type ObjectManifest } from 'twenty-shared/application';
import { type FieldMetadataType } from 'twenty-shared/types';

import { type FieldMetadataUniversalSettings } from 'twenty-shared/types';

// Upstream moved the searchVector `to_tsvector` asExpression out of the field's
// (universal)Settings — `FieldMetadataSettings<TS_VECTOR>` is now `null` — and
// into the dedicated `searchFieldMetadata` mechanism, which derives the column
// expression at DDL generation time. There are therefore no per-field
// universalSettings to compute for a TS_VECTOR field anymore; the value is null.
// Kept as a function (rather than inlining `null`) so the application-manifest
// flat-entity-map computation keeps its TS_VECTOR enrichment seam intact.
export const computeSearchVectorUniversalSettingsFromObjectManifest = ({
  objectManifest: _objectManifest,
}: {
  objectManifest: ObjectManifest;
}): FieldMetadataUniversalSettings<FieldMetadataType.TS_VECTOR> => {
  return null;
};
