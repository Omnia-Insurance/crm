/* @license Enterprise */

import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

import {
  RowLevelPermissionPredicateGroupLogicalOperator,
  RowLevelPermissionPredicateScope,
} from 'twenty-shared/types';

registerEnumType(RowLevelPermissionPredicateGroupLogicalOperator, {
  name: 'RowLevelPermissionPredicateGroupLogicalOperator',
});
registerEnumType(RowLevelPermissionPredicateScope, {
  name: 'RowLevelPermissionPredicateScope',
});
@ObjectType('RowLevelPermissionPredicateGroup')
export class RowLevelPermissionPredicateGroupDTO {
  @Field(() => String)
  id: string;

  @Field(() => String, { nullable: true })
  parentRowLevelPermissionPredicateGroupId?: string | null;

  @Field(() => RowLevelPermissionPredicateGroupLogicalOperator)
  logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator;

  @Field(() => RowLevelPermissionPredicateScope)
  scope: RowLevelPermissionPredicateScope;

  @Field(() => Number, { nullable: true })
  positionInRowLevelPermissionPredicateGroup?: number | null;

  @Field(() => String)
  roleId: string;

  @Field(() => String)
  objectMetadataId: string;
}
