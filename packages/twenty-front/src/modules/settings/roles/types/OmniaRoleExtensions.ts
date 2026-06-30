/**
 * Omnia-specific type extensions for Role and ObjectPermission.
 *
 * The upstream generated types (~/generated-metadata/graphql) do not include
 * Omnia-custom fields such as `editWindowMinutes`, `showInSidebar`,
 * `showAllObjectsInSidebar`, or the RLS `scope` property.  These types augment
 * the generated types so that our custom code compiles without `as any` casts.
 *
 * When codegen is updated to include these fields, these wrappers can be
 * removed and replaced with direct imports from the generated file.
 */

import {
  type ObjectPermission,
  type Role,
  type RowLevelPermissionPredicate,
  type RowLevelPermissionPredicateGroup,
} from '~/generated-metadata/graphql';
import { RowLevelPermissionPredicateScope } from 'twenty-shared/types';

// ---------------------------------------------------------------------------
// RowLevelPermissionPredicateScope — the RLS `scope` enum is Omnia-custom and
// is not emitted by the front-end metadata codegen, so re-export the shared
// definition to keep call-sites stable.
// ---------------------------------------------------------------------------

export { RowLevelPermissionPredicateScope };

// ---------------------------------------------------------------------------
// Extended predicate / predicate-group types — the generated base types are
// missing the Omnia-custom `scope` field (the GraphQL fragments select it, but
// codegen does not know about it), so add it here.
// ---------------------------------------------------------------------------

export type OmniaRowLevelPermissionPredicate = RowLevelPermissionPredicate & {
  scope?: RowLevelPermissionPredicateScope;
};

export type OmniaRowLevelPermissionPredicateGroup =
  RowLevelPermissionPredicateGroup & {
    scope?: RowLevelPermissionPredicateScope;
  };

// ---------------------------------------------------------------------------
// Extended ObjectPermission (adds editWindowMinutes, showInSidebar)
// ---------------------------------------------------------------------------

export type OmniaObjectPermission = ObjectPermission & {
  editWindowMinutes?: number | null;
  showInSidebar?: boolean | null;
};

// ---------------------------------------------------------------------------
// Extended Role (adds editWindowMinutes, showAllObjectsInSidebar, and
// overrides objectPermissions / predicates to use Omnia-extended types)
// ---------------------------------------------------------------------------

export type OmniaRole = Omit<
  Role,
  | 'objectPermissions'
  | 'rowLevelPermissionPredicates'
  | 'rowLevelPermissionPredicateGroups'
> & {
  editWindowMinutes?: number | null;
  showAllObjectsInSidebar?: boolean | null;
  objectPermissions?: Array<OmniaObjectPermission> | null;
  rowLevelPermissionPredicates?:
    | Array<OmniaRowLevelPermissionPredicate>
    | null;
  rowLevelPermissionPredicateGroups?:
    | Array<OmniaRowLevelPermissionPredicateGroup>
    | null;
};
