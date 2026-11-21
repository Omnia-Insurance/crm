import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';

// A role's live permission rows on the dashboard object
export type DashboardAudienceRoleRows = {
  objectPermission: FlatObjectPermission | undefined;
  rules: FlatRowLevelPermissionRule[];
  predicates: FlatRowLevelPermissionPredicate[];
  predicateGroups: FlatRowLevelPermissionPredicateGroup[];
};
