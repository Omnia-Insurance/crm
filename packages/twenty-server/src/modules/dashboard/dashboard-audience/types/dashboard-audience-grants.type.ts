import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';

export type DashboardAudienceGrants = Pick<
  FlatRowLevelPermissionRule,
  | 'canCreateRecords'
  | 'canReadRecords'
  | 'canUpdateRecords'
  | 'canSoftDeleteRecords'
  | 'canDestroyRecords'
>;
