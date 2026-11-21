import {
  RowLevelPermissionPredicateGroupLogicalOperator,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';

import {
  buildRulePredicateMock,
  MEMBER_POLICY_HOP_PREDICATE_MOCK,
  VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { findRowLevelPermissionRuleMatchingEveryRecordViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-matching-every-record-violations.util';

const RULE_ID = VERIFY_PERMISSIONS_IDS.memberPolicyRule;

const findViolations = ({
  predicates,
  predicateGroups = [],
}: {
  predicates: Parameters<
    typeof findRowLevelPermissionRuleMatchingEveryRecordViolations
  >[0]['predicates'];
  predicateGroups?: Parameters<
    typeof findRowLevelPermissionRuleMatchingEveryRecordViolations
  >[0]['predicateGroups'];
}) =>
  findRowLevelPermissionRuleMatchingEveryRecordViolations({
    rules: [{ id: RULE_ID }],
    predicates,
    predicateGroups,
    flatFieldMetadataMaps: VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
    flatObjectMetadataMaps: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  });

describe('findRowLevelPermissionRuleMatchingEveryRecordViolations', () => {
  it('should pass the agent relation hop, which compiles with a stand-in member', () => {
    expect(
      findViolations({ predicates: [MEMBER_POLICY_HOP_PREDICATE_MOCK] }),
    ).toEqual([]);
  });

  it('should pass a static select predicate and skip a rule without predicates', () => {
    expect(
      findViolations({
        predicates: [buildRulePredicateMock({ id: 'status-predicate-id' })],
      }),
    ).toEqual([]);
    expect(findViolations({ predicates: [] })).toEqual([]);
  });

  it('should report a rule whose only predicate has no value to compare', () => {
    expect(
      findViolations({
        predicates: [
          buildRulePredicateMock({ id: 'empty-predicate-id', value: [] }),
        ],
      }),
    ).toEqual([
      {
        check: 'rule-filter',
        message: `row level permission rule ${RULE_ID} compiles to an empty filter, which matches every record`,
        ids: [RULE_ID],
      },
    ]);
  });

  it('should report a rule whose predicate sits in a group the rule never reaches', () => {
    const [violation] = findViolations({
      predicates: [
        buildRulePredicateMock({
          id: 'stranded-predicate-id',
          rowLevelPermissionPredicateGroupId: 'other-rule-group-id',
        }),
      ],
      predicateGroups: [
        {
          id: 'other-rule-group-id',
          logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.AND,
          objectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
          parentRowLevelPermissionPredicateGroupId: null,
          positionInRowLevelPermissionPredicateGroup: null,
          canReadRecords: false,
          canUpdateRecords: false,
          canSoftDeleteRecords: false,
          canDestroyRecords: false,
          roleId: VERIFY_PERMISSIONS_IDS.memberRole,
          rowLevelPermissionRuleId: 'other-rule-id',
        },
      ],
    });

    expect(violation?.check).toBe('rule-filter');
    expect(violation?.message).toContain('matches every record');
  });

  it('should report a rule that does not compile, quoting only the permission error', () => {
    const [violation] = findViolations({
      predicates: [
        buildRulePredicateMock({
          id: 'contains-select-predicate-id',
          operand: RowLevelPermissionPredicateOperand.CONTAINS,
          value: 'ACTIVE',
        }),
      ],
    });

    expect(violation?.check).toBe('rule-filter');
    expect(violation?.message).toContain('does not compile');
    expect(violation?.message).toContain('contains-select-predicate-id');
  });
});
