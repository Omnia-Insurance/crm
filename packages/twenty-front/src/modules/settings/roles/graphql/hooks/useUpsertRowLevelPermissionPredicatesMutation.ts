/* @license Enterprise */

import { useMutation } from '@apollo/client/react';

import { UPSERT_ROW_LEVEL_PERMISSION_PREDICATES } from '@/settings/roles/graphql/mutations/upsertRowLevelPermissionPredicatesMutation';
import {
  type RowLevelPermissionPredicateGroupLogicalOperator,
  type RowLevelPermissionPredicateOperand,
} from '~/generated-metadata/graphql';
import {
  type OmniaRowLevelPermissionPredicate,
  type OmniaRowLevelPermissionPredicateGroup,
  type RowLevelPermissionPredicateScope,
} from '@/settings/roles/types/OmniaRoleExtensions';

export type UpsertRowLevelPermissionPredicatesInput = {
  roleId: string;
  objectMetadataId: string;
  predicates: Array<{
    id?: string;
    fieldMetadataId: string;
    scope: RowLevelPermissionPredicateScope;
    operand: RowLevelPermissionPredicateOperand;
    value?: unknown;
    subFieldName?: string | null;
    workspaceMemberFieldMetadataId?: string | null;
    workspaceMemberSubFieldName?: string | null;
    rowLevelPermissionPredicateGroupId?: string | null;
    positionInRowLevelPermissionPredicateGroup?: number | null;
  }>;
  predicateGroups: Array<{
    id?: string;
    objectMetadataId: string;
    scope: RowLevelPermissionPredicateScope;
    parentRowLevelPermissionPredicateGroupId?: string | null;
    logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator;
    positionInRowLevelPermissionPredicateGroup?: number | null;
  }>;
};

type UpsertRowLevelPermissionPredicatesResult = {
  upsertRowLevelPermissionPredicates: {
    predicates: OmniaRowLevelPermissionPredicate[];
    predicateGroups: OmniaRowLevelPermissionPredicateGroup[];
  };
};

export const useUpsertRowLevelPermissionPredicatesMutation = () => {
  return useMutation<
    UpsertRowLevelPermissionPredicatesResult,
    { input: UpsertRowLevelPermissionPredicatesInput }
  >(UPSERT_ROW_LEVEL_PERMISSION_PREDICATES);
};
