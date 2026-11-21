import { type DisableableObjectPermissionAction } from 'twenty-shared/application';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { getStandardObjectMetadataRelatedEntityIds } from 'src/engine/workspace-manager/twenty-standard-application/utils/get-standard-object-metadata-related-entity-ids.util';
import { buildStandardFlatObjectMetadataMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/object-metadata/build-standard-flat-object-metadata-maps.util';

// The standard object builders are the only record of upstream's per-object lockdown;
// the placeholder ids they are built with do not affect it.
const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000';

export const getStandardObjectDisabledPermissionActionsByUniversalIdentifier =
  (): Record<string, DisableableObjectPermissionAction[]> => {
    const standardFlatObjectMetadataMaps = buildStandardFlatObjectMetadataMaps({
      now: new Date(0).toISOString(),
      workspaceId: PLACEHOLDER_ID,
      twentyStandardApplicationId: PLACEHOLDER_ID,
      standardObjectMetadataRelatedEntityIds:
        getStandardObjectMetadataRelatedEntityIds(),
      dependencyFlatEntityMaps: {
        flatFieldMetadataMaps: createEmptyFlatEntityMaps(),
      },
    });

    return Object.fromEntries(
      Object.values(standardFlatObjectMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .filter(({ disabledObjectPermissionActions }) =>
          isNonEmptyArray(disabledObjectPermissionActions),
        )
        .map(({ universalIdentifier, disabledObjectPermissionActions }) => [
          universalIdentifier,
          disabledObjectPermissionActions as DisableableObjectPermissionAction[],
        ]),
    );
  };
