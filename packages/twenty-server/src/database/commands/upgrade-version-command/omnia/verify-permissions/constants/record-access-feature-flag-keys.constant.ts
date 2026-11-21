import { FeatureFlagKey } from 'twenty-shared/types';

// Each adds record access beside the row level permission rules, or swaps their live check for a materialized one
export const RECORD_ACCESS_FEATURE_FLAG_KEYS = [
  FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED,
  FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED,
  FeatureFlagKey.IS_PRIVATE_RECORDS_ENABLED,
  FeatureFlagKey.IS_RELATED_RECORD_PATHS_ENABLED,
] as const;
