/* @license Enterprise */

import { type RowLevelPermissionPredicateGroupLogicalOperator } from '@/types/RowLevelPermissionPredicateGroupLogicalOperator';
import { type RowLevelPermissionPredicateScope } from '@/types/RowLevelPermissionPredicateScope';

export type RowLevelPermissionPredicateGroup = {
  id: string;
  logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator;
  scope: RowLevelPermissionPredicateScope;
  objectMetadataId: string;
  parentRowLevelPermissionPredicateGroupId: string | null;
  positionInRowLevelPermissionPredicateGroup: number | null;
  roleId: string;
};
