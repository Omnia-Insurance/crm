import {
  type RowLevelPermissionPredicate,
  type RowLevelPermissionPredicateGroup,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { SYNTHETIC_WORKSPACE_MEMBER_ID } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/synthetic-workspace-member-id.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { buildSyntheticMemberFieldValues } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/build-synthetic-member-field-values.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';
import { buildRecordFilterForRule } from 'src/engine/permissions/internal/rls/utils/build-row-level-permission-record-filter.util';
import { PermissionsException } from 'src/engine/permissions/permissions.exception';

type RulePredicate = RowLevelPermissionPredicate & {
  rowLevelPermissionRuleId: string | null;
};

type RulePredicateGroup = RowLevelPermissionPredicateGroup & {
  rowLevelPermissionRuleId: string | null;
};

// An empty filter matches every record for the operations the rule grants, so the rule opens instead of restricting
export const findRowLevelPermissionRuleMatchingEveryRecordViolations = ({
  rules,
  predicates,
  predicateGroups,
  flatFieldMetadataMaps,
  flatObjectMetadataMaps,
}: {
  rules: Pick<FlatRowLevelPermissionRule, 'id'>[];
  predicates: RulePredicate[];
  predicateGroups: RulePredicateGroup[];
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
}): OmniaPermissionsViolation[] =>
  rules.flatMap(({ id: ruleId }) => {
    const rulePredicates = predicates.filter(
      ({ rowLevelPermissionRuleId }) => rowLevelPermissionRuleId === ruleId,
    );

    // The engine drops a rule without predicates, so it opens nothing
    if (rulePredicates.length === 0) {
      return [];
    }

    try {
      const recordFilter = buildRecordFilterForRule({
        rowLevelPermissionRule: {
          predicates: rulePredicates,
          predicateGroups: predicateGroups.filter(
            ({ rowLevelPermissionRuleId }) =>
              rowLevelPermissionRuleId === ruleId,
          ),
        },
        memberFieldValues: buildSyntheticMemberFieldValues({
          predicates: rulePredicates,
          flatFieldMetadataMaps,
        }),
        currentWorkspaceMemberId: SYNTHETIC_WORKSPACE_MEMBER_ID,
        flatFieldMetadataMaps,
        flatObjectMetadataMaps,
        // The flag check requires hops on, and a disabled hop would hide an empty branch behind a never-matching one
        isRelationHopEnabled: true,
      });

      return isDefined(recordFilter) && Object.keys(recordFilter).length === 0
        ? [
            {
              check: OMNIA_PERMISSIONS_CHECK.ruleFilter,
              message: `row level permission rule ${ruleId} compiles to an empty filter, which matches every record`,
              ids: [ruleId],
            },
          ]
        : [];
    } catch (error) {
      // Only permission errors are known to carry metadata alone; others can quote a predicate value
      const reason =
        error instanceof PermissionsException
          ? error.message
          : 'the record filter builder failed';

      return [
        {
          check: OMNIA_PERMISSIONS_CHECK.ruleFilter,
          message: `row level permission rule ${ruleId} does not compile: ${reason}`,
          ids: [ruleId],
        },
      ];
    }
  });
