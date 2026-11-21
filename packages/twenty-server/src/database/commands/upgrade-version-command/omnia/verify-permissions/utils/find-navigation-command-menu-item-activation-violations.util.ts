import { isDefined } from 'twenty-shared/utils';

import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';
import { type FlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/types/flat-command-menu-item.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { readAuthoredOverrideProperty } from 'src/engine/metadata-modules/overrides/utils/read-authored-override-property.util';
import { resolveEffectiveFlatEntityProperty } from 'src/engine/metadata-modules/overrides/utils/resolve-effective-flat-entity-property.util';
import { resolveEffectiveFlatEntity } from 'src/engine/metadata-modules/overrides/utils/resolve-effective-flat-entity.util';

type NavigationFlatCommandMenuItem = Pick<
  FlatCommandMenuItem,
  | 'id'
  | 'isActive'
  | 'engineComponentKey'
  | 'navigationTargetObjectMetadataId'
  | 'overrides'
  | 'applicationUniversalIdentifier'
>;

// Hiding the Go To item of an active object is an admin choice in "Edit command menu", not drift
const isHiddenByWorkspaceOverride = ({
  overrides,
  applicationUniversalIdentifier,
}: NavigationFlatCommandMenuItem): boolean =>
  readAuthoredOverrideProperty({
    metadataName: 'commandMenuItem',
    overrides,
    path: ['isActive'],
    authorContext: {
      ownerApplicationUniversalIdentifier: applicationUniversalIdentifier,
    },
  }) === false;

// Object activation drives its Go To item, so an active item for a deactivated object lists a hidden object
export const findNavigationCommandMenuItemActivationViolations = ({
  flatCommandMenuItems,
  flatObjectMetadataMaps,
}: {
  flatCommandMenuItems: NavigationFlatCommandMenuItem[];
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
}): OmniaPermissionsViolation[] =>
  flatCommandMenuItems.flatMap((flatCommandMenuItem) => {
    const {
      id,
      isActive,
      engineComponentKey,
      navigationTargetObjectMetadataId,
    } = resolveEffectiveFlatEntity({
      metadataName: 'commandMenuItem',
      flatEntity: flatCommandMenuItem,
    });

    if (
      engineComponentKey !== EngineComponentKey.NAVIGATION ||
      !isDefined(navigationTargetObjectMetadataId)
    ) {
      return [];
    }

    const targetFlatObjectMetadata = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: navigationTargetObjectMetadataId,
      flatEntityMaps: flatObjectMetadataMaps,
    });

    if (!isDefined(targetFlatObjectMetadata)) {
      return [];
    }

    const isTargetObjectActive = resolveEffectiveFlatEntityProperty({
      metadataName: 'objectMetadata',
      flatEntity: targetFlatObjectMetadata,
      property: 'isActive',
    });

    if (
      isActive === isTargetObjectActive ||
      (!isActive && isHiddenByWorkspaceOverride(flatCommandMenuItem))
    ) {
      return [];
    }

    return [
      {
        check: OMNIA_PERMISSIONS_CHECK.navigationCommandActivation,
        message: isActive
          ? `navigation command menu item ${id} is active but its object ${targetFlatObjectMetadata.nameSingular} is not`
          : `navigation command menu item ${id} is inactive but its object ${targetFlatObjectMetadata.nameSingular} is active`,
        ids: [id, targetFlatObjectMetadata.id],
      },
    ];
  });
