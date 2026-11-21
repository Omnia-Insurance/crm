import {
  buildRuleMock,
  MEMBER_POLICY_RULE_MOCK,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { findRowLevelPermissionRuleWithoutGrantViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-without-grant-violations.util';

describe('findRowLevelPermissionRuleWithoutGrantViolations', () => {
  it('should pass when every rule grants at least one operation', () => {
    expect(
      findRowLevelPermissionRuleWithoutGrantViolations({
        rules: [
          MEMBER_POLICY_RULE_MOCK,
          buildRuleMock({ id: 'read-only-rule-id', canReadRecords: true }),
        ],
      }),
    ).toEqual([]);
  });

  it('should report a rule whose five grants are all off', () => {
    expect(
      findRowLevelPermissionRuleWithoutGrantViolations({
        rules: [
          MEMBER_POLICY_RULE_MOCK,
          buildRuleMock({ id: 'zeroed-rule-id' }),
        ],
      }),
    ).toEqual([
      {
        check: 'rule-grants',
        message: '1 row level permission rule(s) grant no operation',
        ids: ['zeroed-rule-id'],
      },
    ]);
  });
});
