import { isNonEmptyString } from '@sniptt/guards';

import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { type EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';
import { type FlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/types/flat-command-menu-item.type';
import { resolveEffectiveFlatEntity } from 'src/engine/metadata-modules/overrides/utils/resolve-effective-flat-entity.util';

// Workspace overrides can switch an item on or change its engine key, so the item is read as clients receive it
export const findUngatedCommandMenuItemViolations = ({
  flatCommandMenuItems,
  engineComponentKeys,
}: {
  flatCommandMenuItems: Pick<
    FlatCommandMenuItem,
    | 'id'
    | 'isActive'
    | 'engineComponentKey'
    | 'conditionalAvailabilityExpression'
    | 'overrides'
    | 'applicationUniversalIdentifier'
  >[];
  engineComponentKeys: EngineComponentKey[];
}): OmniaPermissionsViolation[] =>
  flatCommandMenuItems.flatMap((flatCommandMenuItem) => {
    const {
      id,
      isActive,
      engineComponentKey,
      conditionalAvailabilityExpression,
    } = resolveEffectiveFlatEntity({
      metadataName: 'commandMenuItem',
      flatEntity: flatCommandMenuItem,
    });

    if (
      !isActive ||
      !engineComponentKeys.includes(engineComponentKey) ||
      (isNonEmptyString(conditionalAvailabilityExpression) &&
        conditionalAvailabilityExpression.includes('permissionFlags.'))
    ) {
      return [];
    }

    return [
      {
        check: OMNIA_PERMISSIONS_CHECK.phiEgressCommandGate,
        message: `active ${engineComponentKey} command menu item ${id} has no permissionFlags clause in its availability expression`,
        ids: [id],
      },
    ];
  });
