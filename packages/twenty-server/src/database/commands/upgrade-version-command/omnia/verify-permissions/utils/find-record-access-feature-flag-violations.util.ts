import { FeatureFlagKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { RECORD_ACCESS_FEATURE_FLAG_KEYS } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/record-access-feature-flag-keys.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { isRowLevelPermissionRelationHopEnabled } from 'src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util';

// Contract C2 flags: a disabled hop compiles to a never-matching filter, and each record access flag widens access
export const findRecordAccessFeatureFlagViolations = ({
  featureFlagsMap,
  predicates,
}: {
  featureFlagsMap: Partial<Record<FeatureFlagKey, boolean>>;
  predicates: Pick<
    FlatRowLevelPermissionPredicate,
    'id' | 'relationFieldMetadataId'
  >[];
}): OmniaPermissionsViolation[] => {
  const relationHopPredicateIds = predicates
    .filter(({ relationFieldMetadataId }) => isDefined(relationFieldMetadataId))
    .map(({ id }) => id);
  const isRelationHopFlagEnabled =
    featureFlagsMap[
      FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED
    ] === true;

  return [
    ...RECORD_ACCESS_FEATURE_FLAG_KEYS.filter(
      (featureFlagKey) => featureFlagsMap[featureFlagKey] === true,
    ).map((featureFlagKey) => ({
      check: OMNIA_PERMISSIONS_CHECK.recordAccessFeatureFlags,
      message: `${featureFlagKey} is on, which grants record access outside the row level permission rules`,
      ids: [],
    })),
    ...(relationHopPredicateIds.length > 0 && !isRelationHopFlagEnabled
      ? [
          {
            check: OMNIA_PERMISSIONS_CHECK.recordAccessFeatureFlags,
            message: `${relationHopPredicateIds.length} predicate(s) reach their field through a relation but ${FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED} is off, so they match no record`,
            ids: relationHopPredicateIds,
          },
        ]
      : []),
    ...(relationHopPredicateIds.length > 0 &&
    isRelationHopFlagEnabled &&
    !isRowLevelPermissionRelationHopEnabled(featureFlagsMap)
      ? [
          {
            check: OMNIA_PERMISSIONS_CHECK.recordAccessFeatureFlags,
            message: `${relationHopPredicateIds.length} predicate(s) reach their field through a relation but the engine still keeps relation hops off without access groups, so they match no record`,
            ids: relationHopPredicateIds,
          },
        ]
      : []),
  ];
};
