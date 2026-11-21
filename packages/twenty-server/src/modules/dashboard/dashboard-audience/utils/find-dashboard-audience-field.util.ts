import { isDefined } from 'twenty-shared/utils';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { DASHBOARD_AUDIENCE_FIELD_NAME } from 'src/modules/dashboard/dashboard-audience/constants/dashboard-audience-field-name.constant';

export const findDashboardAudienceField = ({
  dashboardObjectMetadataId,
  flatFieldMetadataMaps,
}: {
  dashboardObjectMetadataId: string;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
}): FlatFieldMetadata | undefined =>
  Object.values(flatFieldMetadataMaps.byUniversalIdentifier).find(
    (flatFieldMetadata): flatFieldMetadata is FlatFieldMetadata =>
      isDefined(flatFieldMetadata) &&
      flatFieldMetadata.objectMetadataId === dashboardObjectMetadataId &&
      flatFieldMetadata.name === DASHBOARD_AUDIENCE_FIELD_NAME,
  );
