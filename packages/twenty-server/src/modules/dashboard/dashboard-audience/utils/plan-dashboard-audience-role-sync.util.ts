import { resolveObjectPermissionValue } from 'twenty-shared/application';
import { RowLevelPermissionPredicateOperand } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';
import { removeDisabledOperationsFromRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/utils/remove-disabled-operations-from-row-level-permission-rule.util';
import { DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS } from 'src/modules/dashboard/dashboard-audience/constants/dashboard-audience-denied-object-permission-grants.constant';
import { DASHBOARD_AUDIENCE_INHERITED_OBJECT_PERMISSION_GRANTS } from 'src/modules/dashboard/dashboard-audience/constants/dashboard-audience-inherited-object-permission-grants.constant';
import { type DashboardAudienceGrants } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-grants.type';
import { type DashboardAudienceObjectPermissionGrants } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-object-permission-grants.type';
import { type DashboardAudienceRoleRows } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-rows.type';
import { type DashboardAudienceRoleSyncPlan } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-sync-plan.type';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';

const GRANT_KEYS = [
  'canCreateRecords',
  'canReadRecords',
  'canUpdateRecords',
  'canSoftDeleteRecords',
  'canDestroyRecords',
] as const satisfies (keyof DashboardAudienceGrants)[];

const OBJECT_PERMISSION_GRANT_KEYS = [
  'canCreateObjectRecords',
  'canReadObjectRecords',
  'canUpdateObjectRecords',
  'canSoftDeleteObjectRecords',
  'canDestroyObjectRecords',
] as const satisfies (keyof DashboardAudienceObjectPermissionGrants)[];

const NO_CHANGE_PLAN: DashboardAudienceRoleSyncPlan = {
  objectPermissionGrants: null,
  audienceRuleGrants: null,
  shouldRemoveRowLevelPermissions: false,
};

const isGrantingNoOperation = (grants: DashboardAudienceGrants): boolean =>
  GRANT_KEYS.every((grantKey) => !grants[grantKey]);

// A live row without a rule is a pre-2.58 scoped permission: its grants still sit in the object permission,
// and only the scoped-permission translation may turn them into a rule
const hasUntranslatedRowLevelPermissions = ({
  predicates,
  predicateGroups,
}: DashboardAudienceRoleRows): boolean =>
  [...predicates, ...predicateGroups].some(
    ({ rowLevelPermissionRuleId }) => !isDefined(rowLevelPermissionRuleId),
  );

const areGrantsEqual = (
  left: DashboardAudienceGrants,
  right: DashboardAudienceGrants,
): boolean =>
  GRANT_KEYS.every((grantKey) => left[grantKey] === right[grantKey]);

const isObjectPermissionSetTo = ({
  objectPermission,
  grants,
}: {
  objectPermission: FlatObjectPermission | undefined;
  grants: DashboardAudienceObjectPermissionGrants;
}): boolean =>
  isDefined(objectPermission) &&
  OBJECT_PERMISSION_GRANT_KEYS.every(
    (grantKey) => (objectPermission[grantKey] ?? null) === grants[grantKey],
  );

const pickRuleGrants = (
  rule: FlatRowLevelPermissionRule,
): DashboardAudienceGrants => ({
  canCreateRecords: rule.canCreateRecords,
  canReadRecords: rule.canReadRecords,
  canUpdateRecords: rule.canUpdateRecords,
  canSoftDeleteRecords: rule.canSoftDeleteRecords,
  canDestroyRecords: rule.canDestroyRecords,
});

const resolveObjectGrants = ({
  flatRole,
  dashboardFlatObjectMetadata,
  objectPermission,
}: {
  flatRole: FlatRole;
  dashboardFlatObjectMetadata: FlatObjectMetadata;
  objectPermission: FlatObjectPermission | undefined;
}): DashboardAudienceGrants => {
  const resolve = (
    objectValue: boolean | null | undefined,
    hasAllObjectsPermission: boolean,
  ) =>
    resolveObjectPermissionValue({
      objectValue,
      hasAllObjectsPermission,
      isSystemObject: dashboardFlatObjectMetadata.isSystem,
    });

  return {
    canCreateRecords: resolve(
      objectPermission?.canCreateObjectRecords,
      flatRole.canCreateAllObjectRecords,
    ),
    canReadRecords: resolve(
      objectPermission?.canReadObjectRecords,
      flatRole.canReadAllObjectRecords,
    ),
    canUpdateRecords: resolve(
      objectPermission?.canUpdateObjectRecords,
      flatRole.canUpdateAllObjectRecords,
    ),
    canSoftDeleteRecords: resolve(
      objectPermission?.canSoftDeleteObjectRecords,
      flatRole.canSoftDeleteAllObjectRecords,
    ),
    canDestroyRecords: resolve(
      objectPermission?.canDestroyObjectRecords,
      flatRole.canDestroyAllObjectRecords,
    ),
  };
};

// Contract C1: create follows update; disabled actions drop out exactly as the rule writer drops them
const normalizeAudienceGrants = ({
  grants,
  dashboardFlatObjectMetadata,
}: {
  grants: DashboardAudienceGrants;
  dashboardFlatObjectMetadata: FlatObjectMetadata;
}): DashboardAudienceGrants => {
  const {
    canReadRecords,
    canUpdateRecords,
    canSoftDeleteRecords,
    canDestroyRecords,
  } = removeDisabledOperationsFromRowLevelPermissionRule({
    ruleOperations: grants,
    flatObjectMetadata: dashboardFlatObjectMetadata,
  });

  return {
    canCreateRecords: canUpdateRecords ?? false,
    canReadRecords: canReadRecords ?? false,
    canUpdateRecords: canUpdateRecords ?? false,
    canSoftDeleteRecords: canSoftDeleteRecords ?? false,
    canDestroyRecords: canDestroyRecords ?? false,
  };
};

const isAudienceRuleInPlace = ({
  roleRows,
  audiencePredicate,
  audienceRule,
  audienceFieldMetadataId,
  audienceToken,
  grants,
}: {
  roleRows: DashboardAudienceRoleRows;
  audiencePredicate: FlatRowLevelPermissionPredicate | undefined;
  audienceRule: FlatRowLevelPermissionRule | undefined;
  audienceFieldMetadataId: string | undefined;
  audienceToken: string;
  grants: DashboardAudienceGrants;
}): boolean =>
  isDefined(audiencePredicate) &&
  isDefined(audienceRule) &&
  roleRows.rules.length === 1 &&
  roleRows.predicates.length === 1 &&
  roleRows.predicateGroups.length === 0 &&
  audiencePredicate.fieldMetadataId === audienceFieldMetadataId &&
  audiencePredicate.operand === RowLevelPermissionPredicateOperand.CONTAINS &&
  audiencePredicate.value === JSON.stringify([audienceToken]) &&
  !isDefined(audiencePredicate.relationFieldMetadataId) &&
  !isDefined(audiencePredicate.subFieldName) &&
  !isDefined(audiencePredicate.workspaceMemberFieldMetadataId) &&
  !isDefined(audiencePredicate.workspaceMemberSubFieldName) &&
  !isDefined(audiencePredicate.rowLevelPermissionPredicateGroupId) &&
  areGrantsEqual(pickRuleGrants(audienceRule), grants);

// A gated role reaches dashboards only through its audience rule (contract C1), which keeps the grants the role
// had: those of its audience rule, else its dashboard object grants. A role that grants nothing keeps no rule.
export const planDashboardAudienceRoleSync = ({
  flatRole,
  isGated,
  dashboardFlatObjectMetadata,
  audienceFieldMetadataId,
  audiencePredicateIds,
  roleRows,
}: {
  flatRole: FlatRole;
  isGated: boolean;
  dashboardFlatObjectMetadata: FlatObjectMetadata;
  audienceFieldMetadataId: string | undefined;
  audiencePredicateIds: string[];
  roleRows: DashboardAudienceRoleRows;
}): DashboardAudienceRoleSyncPlan => {
  if (!flatRole.isEditable || hasUntranslatedRowLevelPermissions(roleRows)) {
    return NO_CHANGE_PLAN;
  }

  const audiencePredicate = roleRows.predicates.find(({ id }) =>
    audiencePredicateIds.includes(id),
  );
  const audienceRule = isDefined(audiencePredicate?.rowLevelPermissionRuleId)
    ? roleRows.rules.find(
        ({ id }) => id === audiencePredicate.rowLevelPermissionRuleId,
      )
    : undefined;

  if (!isGated) {
    if (!isDefined(audiencePredicate)) {
      return NO_CHANGE_PLAN;
    }

    // A role that now updates all settings sees every dashboard again: its audience rule goes and the
    // dashboard grants fall back to its role-wide defaults
    return {
      objectPermissionGrants:
        isDefined(roleRows.objectPermission) &&
        !isObjectPermissionSetTo({
          objectPermission: roleRows.objectPermission,
          grants: DASHBOARD_AUDIENCE_INHERITED_OBJECT_PERMISSION_GRANTS,
        })
          ? DASHBOARD_AUDIENCE_INHERITED_OBJECT_PERMISSION_GRANTS
          : null,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: true,
    };
  }

  const objectGrants = resolveObjectGrants({
    flatRole,
    dashboardFlatObjectMetadata,
    objectPermission: roleRows.objectPermission,
  });
  const grants = normalizeAudienceGrants({
    grants: isDefined(audienceRule)
      ? pickRuleGrants(audienceRule)
      : objectGrants,
    dashboardFlatObjectMetadata,
  });

  if (isGrantingNoOperation(grants)) {
    return {
      objectPermissionGrants: isGrantingNoOperation(objectGrants)
        ? null
        : DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions:
        roleRows.rules.length > 0 ||
        roleRows.predicates.length > 0 ||
        roleRows.predicateGroups.length > 0,
    };
  }

  return {
    objectPermissionGrants: isObjectPermissionSetTo({
      objectPermission: roleRows.objectPermission,
      grants: DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS,
    })
      ? null
      : DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS,
    audienceRuleGrants: isAudienceRuleInPlace({
      roleRows,
      audiencePredicate,
      audienceRule,
      audienceFieldMetadataId,
      audienceToken: encodeDashboardAudienceRoleToken(flatRole.id),
      grants,
    })
      ? null
      : grants,
    shouldRemoveRowLevelPermissions: false,
  };
};
