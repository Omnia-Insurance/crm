/* @license Enterprise */

import {
  RecordFilterGroupLogicalOperator,
  type ViewFilterOperand,
} from 'twenty-shared/types';
import { getFilterTypeFromFieldType, isDefined } from 'twenty-shared/utils';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { type CompositeFieldSubFieldName } from '@/settings/data-model/types/CompositeFieldSubFieldName';
import { RowLevelPermissionPredicateGroupLogicalOperator } from '~/generated-metadata/graphql';
import {
  type OmniaRowLevelPermissionPredicate,
  type OmniaRowLevelPermissionPredicateGroup,
  type RowLevelPermissionPredicateScope,
} from '@/settings/roles/types/OmniaRoleExtensions';
import { type RowLevelPermissionPredicateOperand } from '~/generated-metadata/graphql';

export const convertPredicateToRecordFilter = (
  predicate: OmniaRowLevelPermissionPredicate,
  fieldMetadataItem: FieldMetadataItem | undefined,
): RecordFilter | null => {
  if (!isDefined(fieldMetadataItem)) {
    return null;
  }

  const filterType = getFilterTypeFromFieldType(fieldMetadataItem.type);

  const valueString =
    typeof predicate.value === 'string'
      ? predicate.value
      : isDefined(predicate.value)
        ? JSON.stringify(predicate.value)
        : '';

  return {
    id: predicate.id,
    fieldMetadataId: predicate.fieldMetadataId,
    value: valueString,
    displayValue: valueString,
    type: filterType,
    operand: predicate.operand as unknown as ViewFilterOperand,
    label: fieldMetadataItem.label,
    subFieldName: predicate.subFieldName as
      | CompositeFieldSubFieldName
      | null
      | undefined,
    recordFilterGroupId:
      predicate.rowLevelPermissionPredicateGroupId ?? undefined,
    positionInRecordFilterGroup:
      predicate.positionInRowLevelPermissionPredicateGroup,
    rlsDynamicValue: isDefined(predicate.workspaceMemberFieldMetadataId)
      ? {
          workspaceMemberFieldMetadataId:
            predicate.workspaceMemberFieldMetadataId,
          workspaceMemberSubFieldName:
            predicate.workspaceMemberSubFieldName ?? null,
        }
      : null,
  };
};

export const convertRecordFilterToPredicate = (
  filter: RecordFilter,
  roleId: string,
  objectMetadataId: string,
  scope: RowLevelPermissionPredicateScope,
): OmniaRowLevelPermissionPredicate => {
  if (isDefined(filter.rlsDynamicValue)) {
    return {
      __typename: 'RowLevelPermissionPredicate',
      id: filter.id,
      fieldMetadataId: filter.fieldMetadataId,
      objectMetadataId,
      scope,
      operand: filter.operand as unknown as RowLevelPermissionPredicateOperand,
      value: null,
      subFieldName: filter.subFieldName ?? null,
      rowLevelPermissionPredicateGroupId: filter.recordFilterGroupId ?? null,
      positionInRowLevelPermissionPredicateGroup:
        filter.positionInRecordFilterGroup ?? null,
      roleId,
      workspaceMemberFieldMetadataId:
        filter.rlsDynamicValue.workspaceMemberFieldMetadataId,
      workspaceMemberSubFieldName:
        filter.rlsDynamicValue.workspaceMemberSubFieldName ?? null,
    };
  }

  return {
    __typename: 'RowLevelPermissionPredicate',
    id: filter.id,
    fieldMetadataId: filter.fieldMetadataId,
    objectMetadataId,
    scope,
    operand: filter.operand as unknown as RowLevelPermissionPredicateOperand,
    value: filter.value || null,
    subFieldName: filter.subFieldName ?? null,
    rowLevelPermissionPredicateGroupId: filter.recordFilterGroupId ?? null,
    positionInRowLevelPermissionPredicateGroup:
      filter.positionInRecordFilterGroup ?? null,
    roleId,
    workspaceMemberFieldMetadataId: null,
    workspaceMemberSubFieldName: null,
  };
};

export const convertPredicateGroupToRecordFilterGroup = (
  predicateGroup: OmniaRowLevelPermissionPredicateGroup,
): RecordFilterGroup => {
  return {
    id: predicateGroup.id,
    parentRecordFilterGroupId:
      predicateGroup.parentRowLevelPermissionPredicateGroupId ?? null,
    logicalOperator:
      predicateGroup.logicalOperator ===
      RowLevelPermissionPredicateGroupLogicalOperator.AND
        ? RecordFilterGroupLogicalOperator.AND
        : RecordFilterGroupLogicalOperator.OR,
    positionInRecordFilterGroup:
      predicateGroup.positionInRowLevelPermissionPredicateGroup ?? null,
  };
};

export const convertRecordFilterGroupToPredicateGroup = (
  filterGroup: RecordFilterGroup,
  roleId: string,
  objectMetadataId: string,
  scope: RowLevelPermissionPredicateScope,
): OmniaRowLevelPermissionPredicateGroup => {
  return {
    __typename: 'RowLevelPermissionPredicateGroup',
    id: filterGroup.id,
    scope,
    parentRowLevelPermissionPredicateGroupId:
      filterGroup.parentRecordFilterGroupId ?? null,
    logicalOperator:
      filterGroup.logicalOperator === RecordFilterGroupLogicalOperator.AND
        ? RowLevelPermissionPredicateGroupLogicalOperator.AND
        : RowLevelPermissionPredicateGroupLogicalOperator.OR,
    positionInRowLevelPermissionPredicateGroup:
      filterGroup.positionInRecordFilterGroup ?? null,
    roleId,
    objectMetadataId,
  };
};
