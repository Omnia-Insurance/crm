import { type FieldMetadataComplexOption } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';
import { getDashboardAudienceOptionColor } from 'src/modules/dashboard/dashboard-audience/utils/get-dashboard-audience-option-color.util';

// Surviving options keep their id, color and order so the field's enum stays stable; new roles go last
export const computeDashboardAudienceOptions = ({
  gatedFlatRoles,
  currentOptions,
}: {
  gatedFlatRoles: Pick<FlatRole, 'id' | 'label'>[];
  currentOptions: FieldMetadataComplexOption[];
}): FieldMetadataComplexOption[] => {
  const gatedFlatRoleByToken = new Map(
    gatedFlatRoles.map((flatRole) => [
      encodeDashboardAudienceRoleToken(flatRole.id),
      flatRole,
    ]),
  );

  const keptTokens = new Set<string>();

  const keptOptions = [...currentOptions]
    .sort((left, right) => left.position - right.position)
    .flatMap((option) => {
      const flatRole = gatedFlatRoleByToken.get(option.value);

      if (!isDefined(flatRole) || keptTokens.has(option.value)) {
        return [];
      }

      keptTokens.add(option.value);

      return [{ ...option, label: flatRole.label }];
    });

  const addedOptions = gatedFlatRoles
    .filter(
      (flatRole) =>
        !keptTokens.has(encodeDashboardAudienceRoleToken(flatRole.id)),
    )
    .sort(
      (left, right) =>
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id),
    )
    .map((flatRole) => ({
      value: encodeDashboardAudienceRoleToken(flatRole.id),
      label: flatRole.label,
      color: getDashboardAudienceOptionColor(flatRole.id),
    }));

  return [...keptOptions, ...addedOptions].map((option, position) => ({
    ...option,
    position,
  }));
};
