import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByUniversalIdentifier } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-universal-identifier.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

export const findDashboardFlatObjectMetadata = (
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
): FlatObjectMetadata | undefined =>
  findFlatEntityByUniversalIdentifier({
    universalIdentifier: STANDARD_OBJECTS.dashboard.universalIdentifier,
    flatEntityMaps: flatObjectMetadataMaps,
  });
