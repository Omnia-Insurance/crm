import { type DisableableObjectPermissionAction } from 'twenty-shared/application';

import { computeOmniaMissingStandardObjectDisabledActions } from 'src/database/commands/upgrade-version-command/omnia/utils/compute-omnia-missing-standard-object-disabled-actions.util';
import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

export const findStandardObjectPermissionLockdownViolations = ({
  objectMetadatas,
  expectedDisabledActionsByUniversalIdentifier,
}: {
  objectMetadatas: Pick<
    FlatObjectMetadata,
    | 'id'
    | 'universalIdentifier'
    | 'nameSingular'
    | 'disabledObjectPermissionActions'
  >[];
  expectedDisabledActionsByUniversalIdentifier: Record<
    string,
    DisableableObjectPermissionAction[]
  >;
}): OmniaPermissionsViolation[] =>
  computeOmniaMissingStandardObjectDisabledActions({
    objectMetadatas,
    expectedDisabledActionsByUniversalIdentifier,
  }).map(({ objectMetadataId, nameSingular, missingActions }) => ({
    check: OMNIA_PERMISSIONS_CHECK.standardObjectLockdown,
    message: `Standard object ${nameSingular} lacks the disabled record actions a fresh workspace gives it (${missingActions.join(', ')}), so roles without an override can use them`,
    ids: [objectMetadataId],
  }));
