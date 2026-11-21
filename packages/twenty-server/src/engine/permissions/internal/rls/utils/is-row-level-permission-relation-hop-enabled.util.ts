/* @license Enterprise */

import { FeatureFlagKey } from 'twenty-shared/types';

// OMNIA-CUSTOM: hop RLS (policy.agent → agentProfile.workspaceMember = Me) evaluated live as SQL EXISTS;
// access groups (materialized, stale windows) stay off in prod.
export const isRowLevelPermissionRelationHopEnabled = (
  featureFlagsMap: Partial<Record<FeatureFlagKey, boolean>>,
): boolean =>
  featureFlagsMap[
    FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED
  ] ?? false;
