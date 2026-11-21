import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';

type RowLevelPermissionRuleGrants = Pick<
  FlatRowLevelPermissionRule,
  | 'canCreateRecords'
  | 'canReadRecords'
  | 'canUpdateRecords'
  | 'canSoftDeleteRecords'
  | 'canDestroyRecords'
>;

const isGrantingNoOperation = (rule: RowLevelPermissionRuleGrants): boolean =>
  !rule.canCreateRecords &&
  !rule.canReadRecords &&
  !rule.canUpdateRecords &&
  !rule.canSoftDeleteRecords &&
  !rule.canDestroyRecords;

// A scope-blind translation zeroes the grants it cannot copy, which locks the role out of what the rule was for
export const findRowLevelPermissionRuleWithoutGrantViolations = ({
  rules,
}: {
  rules: (Pick<FlatRowLevelPermissionRule, 'id'> &
    RowLevelPermissionRuleGrants)[];
}): OmniaPermissionsViolation[] => {
  const ruleIds = rules.filter(isGrantingNoOperation).map(({ id }) => id);

  return ruleIds.length > 0
    ? [
        {
          check: OMNIA_PERMISSIONS_CHECK.ruleGrants,
          message: `${ruleIds.length} row level permission rule(s) grant no operation`,
          ids: ruleIds,
        },
      ]
    : [];
};
