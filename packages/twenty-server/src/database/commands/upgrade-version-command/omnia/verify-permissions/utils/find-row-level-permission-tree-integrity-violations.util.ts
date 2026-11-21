import { isDefined } from 'twenty-shared/utils';

import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';

type TreeNode = Pick<
  FlatRowLevelPermissionPredicateGroup,
  'id' | 'roleId' | 'objectMetadataId' | 'rowLevelPermissionRuleId'
>;

// The engine walks a rule from its roots, so a branch under a deleted group, or a group of another role, object or
// rule, is never evaluated
export const findRowLevelPermissionTreeIntegrityViolations = ({
  predicates,
  predicateGroups,
}: {
  predicates: (TreeNode &
    Pick<
      FlatRowLevelPermissionPredicate,
      'rowLevelPermissionPredicateGroupId'
    >)[];
  predicateGroups: (TreeNode &
    Pick<
      FlatRowLevelPermissionPredicateGroup,
      'parentRowLevelPermissionPredicateGroupId' | 'deletedAt'
    >)[];
}): OmniaPermissionsViolation[] => {
  const predicateGroupById = new Map(
    predicateGroups.map((predicateGroup) => [
      predicateGroup.id,
      predicateGroup,
    ]),
  );

  const findBrokenParentReason = ({
    node,
    parentPredicateGroupId,
  }: {
    node: TreeNode;
    parentPredicateGroupId: string;
  }): string | undefined => {
    const parentPredicateGroup = predicateGroupById.get(parentPredicateGroupId);

    if (!isDefined(parentPredicateGroup)) {
      return 'is missing';
    }

    if (isDefined(parentPredicateGroup.deletedAt)) {
      return 'is deleted';
    }

    if (
      parentPredicateGroup.roleId !== node.roleId ||
      parentPredicateGroup.objectMetadataId !== node.objectMetadataId
    ) {
      return 'belongs to another role or object';
    }

    return parentPredicateGroup.rowLevelPermissionRuleId !==
      node.rowLevelPermissionRuleId
      ? 'belongs to another rule'
      : undefined;
  };

  const toViolations = ({
    node,
    nodeLabel,
    parentLabel,
    parentPredicateGroupId,
  }: {
    node: TreeNode;
    nodeLabel: string;
    parentLabel: string;
    parentPredicateGroupId: string | null;
  }): OmniaPermissionsViolation[] => {
    if (!isDefined(parentPredicateGroupId)) {
      return [];
    }

    const reason = findBrokenParentReason({ node, parentPredicateGroupId });

    return isDefined(reason)
      ? [
          {
            check: OMNIA_PERMISSIONS_CHECK.predicateTree,
            message: `${nodeLabel} ${node.id}: its ${parentLabel} ${parentPredicateGroupId} ${reason}`,
            ids: [node.id, parentPredicateGroupId],
          },
        ]
      : [];
  };

  return [
    ...predicateGroups
      .filter(({ deletedAt }) => !isDefined(deletedAt))
      .flatMap((predicateGroup) =>
        toViolations({
          node: predicateGroup,
          nodeLabel: 'predicate group',
          parentLabel: 'parent group',
          parentPredicateGroupId:
            predicateGroup.parentRowLevelPermissionPredicateGroupId,
        }),
      ),
    ...predicates.flatMap((predicate) =>
      toViolations({
        node: predicate,
        nodeLabel: 'predicate',
        parentLabel: 'group',
        parentPredicateGroupId: predicate.rowLevelPermissionPredicateGroupId,
      }),
    ),
  ];
};
