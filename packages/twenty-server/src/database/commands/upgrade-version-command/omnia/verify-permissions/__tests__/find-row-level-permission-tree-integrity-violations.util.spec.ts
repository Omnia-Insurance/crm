import { findRowLevelPermissionTreeIntegrityViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-tree-integrity-violations.util';

const buildGroup = ({
  id,
  parentRowLevelPermissionPredicateGroupId = null,
  roleId = 'member-role-id',
  rowLevelPermissionRuleId = 'member-rule-id',
  deletedAt = null,
}: {
  id: string;
  parentRowLevelPermissionPredicateGroupId?: string | null;
  roleId?: string;
  rowLevelPermissionRuleId?: string | null;
  deletedAt?: string | null;
}) => ({
  id,
  roleId,
  objectMetadataId: 'policy-object-id',
  rowLevelPermissionRuleId,
  parentRowLevelPermissionPredicateGroupId,
  deletedAt,
});

const buildPredicate = ({
  id,
  rowLevelPermissionPredicateGroupId,
  rowLevelPermissionRuleId = 'member-rule-id',
}: {
  id: string;
  rowLevelPermissionPredicateGroupId: string | null;
  rowLevelPermissionRuleId?: string | null;
}) => ({
  id,
  roleId: 'member-role-id',
  objectMetadataId: 'policy-object-id',
  rowLevelPermissionRuleId,
  rowLevelPermissionPredicateGroupId,
});

describe('findRowLevelPermissionTreeIntegrityViolations', () => {
  it('should pass a tree whose groups and predicates hang off live groups of the same rule', () => {
    expect(
      findRowLevelPermissionTreeIntegrityViolations({
        predicateGroups: [
          buildGroup({ id: 'root-group-id' }),
          buildGroup({
            id: 'child-group-id',
            parentRowLevelPermissionPredicateGroupId: 'root-group-id',
          }),
        ],
        predicates: [
          buildPredicate({
            id: 'predicate-id',
            rowLevelPermissionPredicateGroupId: 'child-group-id',
          }),
          buildPredicate({
            id: 'ungrouped-predicate-id',
            rowLevelPermissionPredicateGroupId: null,
          }),
        ],
      }),
    ).toEqual([]);
  });

  it('should report a group whose parent belongs to another role or is deleted', () => {
    const violations = findRowLevelPermissionTreeIntegrityViolations({
      predicateGroups: [
        buildGroup({ id: 'agent-group-id', roleId: 'agent-role-id' }),
        buildGroup({ id: 'deleted-group-id', deletedAt: '2026-01-01' }),
        buildGroup({
          id: 'cross-role-child-id',
          parentRowLevelPermissionPredicateGroupId: 'agent-group-id',
        }),
        buildGroup({
          id: 'orphaned-child-id',
          parentRowLevelPermissionPredicateGroupId: 'deleted-group-id',
        }),
      ],
      predicates: [],
    });

    expect(violations).toEqual([
      {
        check: 'predicate-tree',
        message:
          'predicate group cross-role-child-id: its parent group agent-group-id belongs to another role or object',
        ids: ['cross-role-child-id', 'agent-group-id'],
      },
      {
        check: 'predicate-tree',
        message:
          'predicate group orphaned-child-id: its parent group deleted-group-id is deleted',
        ids: ['orphaned-child-id', 'deleted-group-id'],
      },
    ]);
  });

  it('should report a predicate whose group belongs to another rule', () => {
    const [violation] = findRowLevelPermissionTreeIntegrityViolations({
      predicateGroups: [
        buildGroup({
          id: 'other-rule-group-id',
          rowLevelPermissionRuleId: 'other-rule-id',
        }),
      ],
      predicates: [
        buildPredicate({
          id: 'predicate-id',
          rowLevelPermissionPredicateGroupId: 'other-rule-group-id',
        }),
      ],
    });

    expect(violation?.message).toBe(
      'predicate predicate-id: its group other-rule-group-id belongs to another rule',
    );
  });
});
