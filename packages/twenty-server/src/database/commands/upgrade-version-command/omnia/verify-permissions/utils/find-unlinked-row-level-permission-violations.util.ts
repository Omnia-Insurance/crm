import { isDefined } from 'twenty-shared/utils';

import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';

type RuleOwnedRow = Pick<
  FlatRowLevelPermissionPredicate,
  'id' | 'roleId' | 'objectMetadataId' | 'rowLevelPermissionRuleId'
>;

// The engine reads predicates and groups only through their rule, so an unlinked or misowned row restricts nothing
export const findUnlinkedRowLevelPermissionViolations = ({
  predicates,
  predicateGroups,
  rules,
}: {
  predicates: RuleOwnedRow[];
  predicateGroups: RuleOwnedRow[];
  rules: Pick<
    FlatRowLevelPermissionRule,
    'id' | 'roleId' | 'objectMetadataId'
  >[];
}): OmniaPermissionsViolation[] => {
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

  const isLinkedToAnotherOwnerRule = ({
    roleId,
    objectMetadataId,
    rowLevelPermissionRuleId,
  }: RuleOwnedRow): boolean => {
    if (!isDefined(rowLevelPermissionRuleId)) {
      return false;
    }

    const rule = ruleById.get(rowLevelPermissionRuleId);

    return (
      !isDefined(rule) ||
      rule.roleId !== roleId ||
      rule.objectMetadataId !== objectMetadataId
    );
  };

  return (
    [
      ['predicate', predicates],
      ['predicate group', predicateGroups],
    ] as const
  ).flatMap(([rowKind, rows]) => {
    const unlinkedIds = rows
      .filter(
        ({ rowLevelPermissionRuleId }) => !isDefined(rowLevelPermissionRuleId),
      )
      .map(({ id }) => id);
    const misownedIds = rows
      .filter(isLinkedToAnotherOwnerRule)
      .map(({ id }) => id);

    return [
      ...(unlinkedIds.length > 0
        ? [
            {
              check: OMNIA_PERMISSIONS_CHECK.ruleLink,
              message: `${unlinkedIds.length} live ${rowKind}(s) have no row level permission rule, so the engine ignores them`,
              ids: unlinkedIds,
            },
          ]
        : []),
      ...(misownedIds.length > 0
        ? [
            {
              check: OMNIA_PERMISSIONS_CHECK.ruleLink,
              message: `${misownedIds.length} live ${rowKind}(s) point at a rule that is missing or belongs to another role or object`,
              ids: misownedIds,
            },
          ]
        : []),
    ];
  });
};
