/* @license Enterprise */

import { type RowLevelPermissionPredicateOperand } from '@/types/RowLevelPermissionPredicateOperand';
import { type RowLevelPermissionPredicateScope } from '@/types/RowLevelPermissionPredicateScope';
import { type RowLevelPermissionPredicateValue } from '@/types/RowLevelPermissionPredicateValue';

export type RowLevelPermissionPredicate = {
  id: string;
  fieldMetadataId: string;
  objectMetadataId: string;
  scope: RowLevelPermissionPredicateScope;
  operand: RowLevelPermissionPredicateOperand;
  value: RowLevelPermissionPredicateValue;
  subFieldName: string | null;
  workspaceMemberFieldMetadataId: string | null;
  workspaceMemberSubFieldName: string | null;
  roleId: string;
};
