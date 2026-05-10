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

// ---------------------------------------------------------------------------
// RowLevelPermissionPredicateScope — upstream now generates this type from the
// schema, so re-export the generated enum to keep call-sites stable.
// ---------------------------------------------------------------------------

export { RowLevelPermissionPredicateScope } from '~/generated-metadata/graphql';

// ---------------------------------------------------------------------------
// Extended predicate / predicate-group types — `scope` is now part of the
// upstream-generated base types, so no extension is needed.
// ---------------------------------------------------------------------------

export type OmniaRowLevelPermissionPredicate = RowLevelPermissionPredicate;

export type OmniaRowLevelPermissionPredicateGroup =
  RowLevelPermissionPredicateGroup;

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
