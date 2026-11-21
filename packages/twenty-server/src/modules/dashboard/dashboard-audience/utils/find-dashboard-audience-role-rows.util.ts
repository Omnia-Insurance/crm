import { isDefined } from 'twenty-shared/utils';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';
import { type DashboardAudienceRoleRows } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-rows.type';

const findRoleObjectRows = <
  TFlatEntity extends { roleId: string; objectMetadataId: string },
>({
  flatEntityMaps,
  roleId,
  objectMetadataId,
}: {
  flatEntityMaps: {
    byUniversalIdentifier: Partial<Record<string, TFlatEntity>>;
  };
  roleId: string;
  objectMetadataId: string;
}): TFlatEntity[] =>
  Object.values(flatEntityMaps.byUniversalIdentifier).filter(
    (flatEntity): flatEntity is TFlatEntity =>
      isDefined(flatEntity) &&
      flatEntity.roleId === roleId &&
      flatEntity.objectMetadataId === objectMetadataId,
  );

export const findDashboardAudienceRoleRows = ({
  roleId,
  dashboardObjectMetadataId,
  flatObjectPermissionMaps,
  flatRowLevelPermissionRuleMaps,
  flatRowLevelPermissionPredicateMaps,
  flatRowLevelPermissionPredicateGroupMaps,
}: {
  roleId: string;
  dashboardObjectMetadataId: string;
  flatObjectPermissionMaps: FlatEntityMaps<FlatObjectPermission>;
  flatRowLevelPermissionRuleMaps: FlatEntityMaps<FlatRowLevelPermissionRule>;
  flatRowLevelPermissionPredicateMaps: FlatEntityMaps<FlatRowLevelPermissionPredicate>;
  flatRowLevelPermissionPredicateGroupMaps: FlatEntityMaps<FlatRowLevelPermissionPredicateGroup>;
}): DashboardAudienceRoleRows => {
  const roleAndObject = { roleId, objectMetadataId: dashboardObjectMetadataId };

  return {
    objectPermission: findRoleObjectRows({
      flatEntityMaps: flatObjectPermissionMaps,
      ...roleAndObject,
    })[0],
    rules: findRoleObjectRows({
      flatEntityMaps: flatRowLevelPermissionRuleMaps,
      ...roleAndObject,
    }),
    predicates: findRoleObjectRows({
      flatEntityMaps: flatRowLevelPermissionPredicateMaps,
      ...roleAndObject,
    }).filter(({ deletedAt }) => !isDefined(deletedAt)),
    predicateGroups: findRoleObjectRows({
      flatEntityMaps: flatRowLevelPermissionPredicateGroupMaps,
      ...roleAndObject,
    }).filter(({ deletedAt }) => !isDefined(deletedAt)),
  };
};
