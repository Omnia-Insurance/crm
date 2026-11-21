import { RowLevelPermissionPredicateEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity';
import { RowLevelPermissionRuleEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-rule.entity';
import { UpgradeAwareRepositoryState } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-repository-state';

// False while an upgrade has not reached the 2.58 rule table or the predicates' rule link: the caches then
// show no rule at all, so a permission sync planned from them would undo the gates the upgrade translates
export const isRowLevelPermissionRuleSchemaAvailable = (): boolean => {
  const upgradeAwareRepositoryState = UpgradeAwareRepositoryState.getInstance();

  return (
    upgradeAwareRepositoryState.isEntityAvailable(
      RowLevelPermissionRuleEntity,
    ) &&
    !upgradeAwareRepositoryState
      .getHiddenColumnPropertyNames(RowLevelPermissionPredicateEntity)
      .has('rowLevelPermissionRuleId')
  );
};
