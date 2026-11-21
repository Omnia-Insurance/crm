import { type FeatureFlagKey } from 'twenty-shared/types';
import {
  canReachAllRecords,
  isRowLevelRecordsPermissionsRuleGrantingOperation,
} from 'twenty-shared/utils';

import { OBJECT_RECORDS_OPERATION_TYPES } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/object-records-operation-types.constant';
import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { PHI_OBJECT_NAME_SINGULARS } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/phi-object-name-singulars.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { getEnforcedOperationTypes } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/get-enforced-operation-types.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';

// Contract C1: an object-level all-records grant wins over every rule, so on a PHI object it must never cover an
// operation that a rule of the same role was meant to restrict
export const findPhiAllRecordsGrantViolations = ({
  objectMetadatas,
  rules,
  rolesPermissions,
  featureFlagsMap,
}: {
  objectMetadatas: Pick<FlatObjectMetadata, 'id' | 'nameSingular'>[];
  rules: Pick<
    FlatRowLevelPermissionRule,
    | 'id'
    | 'roleId'
    | 'objectMetadataId'
    | 'canCreateRecords'
    | 'canReadRecords'
    | 'canUpdateRecords'
    | 'canSoftDeleteRecords'
    | 'canDestroyRecords'
  >[];
  rolesPermissions: Record<string, RoleRecordsPermissions>;
  featureFlagsMap: Partial<Record<FeatureFlagKey, boolean>>;
}): OmniaPermissionsViolation[] => {
  const operationTypes = getEnforcedOperationTypes({
    operationTypes: OBJECT_RECORDS_OPERATION_TYPES,
    featureFlagsMap,
  });

  return objectMetadatas
    .filter(({ nameSingular }) =>
      PHI_OBJECT_NAME_SINGULARS.includes(nameSingular),
    )
    .flatMap((objectMetadata) => {
      const objectRules = rules.filter(
        ({ objectMetadataId }) => objectMetadataId === objectMetadata.id,
      );
      const roleIds = [...new Set(objectRules.map(({ roleId }) => roleId))];

      return roleIds.flatMap((roleId) => {
        const roleRules = objectRules.filter((rule) => rule.roleId === roleId);
        const objectRecordsPermissions =
          rolesPermissions[roleId]?.objects[objectMetadata.id];
        const overriddenOperationTypes = operationTypes.filter(
          (operationType) =>
            canReachAllRecords({ objectRecordsPermissions, operationType }) &&
            roleRules.some((rule) =>
              isRowLevelRecordsPermissionsRuleGrantingOperation({
                rule,
                operationType,
              }),
            ),
        );

        return overriddenOperationTypes.length > 0
          ? [
              {
                check: OMNIA_PERMISSIONS_CHECK.phiAllRecordsGrant,
                message: `role ${roleId} reaches every ${objectMetadata.nameSingular} record for ${overriddenOperationTypes.join(', ')} through an object-level grant, which overrides its row level permission rule(s)`,
                ids: [
                  roleId,
                  objectMetadata.id,
                  ...roleRules.map(({ id }) => id),
                ],
              },
            ]
          : [];
      });
    });
};
