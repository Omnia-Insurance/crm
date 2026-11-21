import { findUnlinkedRowLevelPermissionViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-unlinked-row-level-permission-violations.util';

const MEMBER_RULE = {
  id: 'member-rule-id',
  roleId: 'member-role-id',
  objectMetadataId: 'policy-object-id',
};

const buildRow = (
  id: string,
  rowLevelPermissionRuleId: string | null,
  roleId = 'member-role-id',
) => ({
  id,
  roleId,
  objectMetadataId: 'policy-object-id',
  rowLevelPermissionRuleId,
});

describe('findUnlinkedRowLevelPermissionViolations', () => {
  it('should pass when every live predicate and group is linked to a rule of its own role and object', () => {
    expect(
      findUnlinkedRowLevelPermissionViolations({
        predicates: [buildRow('predicate-id', MEMBER_RULE.id)],
        predicateGroups: [buildRow('group-id', MEMBER_RULE.id)],
        rules: [MEMBER_RULE],
      }),
    ).toEqual([]);
  });

  it('should report a predicate left without a rule', () => {
    expect(
      findUnlinkedRowLevelPermissionViolations({
        predicates: [buildRow('unlinked-predicate-id', null)],
        predicateGroups: [],
        rules: [MEMBER_RULE],
      }),
    ).toEqual([
      {
        check: 'rule-link',
        message:
          '1 live predicate(s) have no row level permission rule, so the engine ignores them',
        ids: ['unlinked-predicate-id'],
      },
    ]);
  });

  it('should report a group linked to a missing rule or to the rule of another role', () => {
    const [violation] = findUnlinkedRowLevelPermissionViolations({
      predicates: [],
      predicateGroups: [
        buildRow('foreign-group-id', MEMBER_RULE.id, 'agent-role-id'),
        buildRow('orphan-group-id', 'deleted-rule-id'),
      ],
      rules: [MEMBER_RULE],
    });

    expect(violation.check).toBe('rule-link');
    expect(violation.ids).toEqual(['foreign-group-id', 'orphan-group-id']);
  });
});
