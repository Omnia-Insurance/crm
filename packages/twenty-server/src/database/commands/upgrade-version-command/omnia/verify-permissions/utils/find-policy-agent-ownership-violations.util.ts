import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import {
  type FeatureFlagKey,
  type ObjectRecordsOperationType,
  type RowLevelPermissionPredicate,
} from 'twenty-shared/types';
import {
  canReachAllRecords,
  isDefined,
  isRowLevelRecordsPermissionsRuleGrantingOperation,
} from 'twenty-shared/utils';

import { BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/brokerage-agent-role-universal-identifier.constant';
import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { getEnforcedOperationTypes } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/get-enforced-operation-types.util';
import { isPolicyAgentRelationHopPredicate } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/is-policy-agent-relation-hop-predicate.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';

const POLICY_OWNER_ROLES = [
  { roleName: 'Member', universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER },
  {
    roleName: 'Brokerage Agent',
    universalIdentifier: BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
  },
];

type PolicyRule = Pick<
  FlatRowLevelPermissionRule,
  | 'id'
  | 'roleId'
  | 'objectMetadataId'
  | 'canCreateRecords'
  | 'canReadRecords'
  | 'canUpdateRecords'
  | 'canSoftDeleteRecords'
  | 'canDestroyRecords'
>;

// Contract C1 "read all, write own": agents read every policy and write only those whose agent is them
export const findPolicyAgentOwnershipViolations = ({
  roles,
  objectMetadatas,
  rules,
  predicates,
  predicateGroups,
  flatFieldMetadataMaps,
  flatObjectMetadataMaps,
  rolesPermissions,
  featureFlagsMap,
}: {
  roles: Pick<FlatRole, 'id' | 'universalIdentifier'>[];
  objectMetadatas: Pick<FlatObjectMetadata, 'id' | 'nameSingular'>[];
  rules: PolicyRule[];
  predicates: (RowLevelPermissionPredicate & {
    rowLevelPermissionRuleId: string | null;
  })[];
  predicateGroups: Pick<
    FlatRowLevelPermissionPredicateGroup,
    | 'id'
    | 'rowLevelPermissionRuleId'
    | 'parentRowLevelPermissionPredicateGroupId'
  >[];
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  rolesPermissions: Record<string, RoleRecordsPermissions>;
  featureFlagsMap: Partial<Record<FeatureFlagKey, boolean>>;
}): OmniaPermissionsViolation[] => {
  const policyObjectMetadata = objectMetadatas.find(
    ({ nameSingular }) => nameSingular === 'policy',
  );

  if (!isDefined(policyObjectMetadata)) {
    return [];
  }

  // C1: create and update need the agent hop; softDelete and destroy keep their old rule grant but never reach every policy
  const ownedWriteOperationTypes = getEnforcedOperationTypes({
    operationTypes: ['create', 'update'],
    featureFlagsMap,
  });
  const writeOperationTypes: ObjectRecordsOperationType[] = [
    ...ownedWriteOperationTypes,
    'softDelete',
    'destroy',
  ];

  // Groups are AND or OR only, so a lone hop reached through the rule's groups compiles to the hop itself;
  // the settings editor always writes such a root group
  const isAgentRelationHopRule = ({ id: ruleId }: PolicyRule): boolean => {
    const rulePredicates = predicates.filter(
      ({ rowLevelPermissionRuleId }) => rowLevelPermissionRuleId === ruleId,
    );

    if (rulePredicates.length !== 1) {
      return false;
    }

    const [predicate] = rulePredicates;
    const rulePredicateGroupById = new Map(
      predicateGroups
        .filter(
          ({ rowLevelPermissionRuleId }) => rowLevelPermissionRuleId === ruleId,
        )
        .map((predicateGroup) => [predicateGroup.id, predicateGroup]),
    );
    const visitedPredicateGroupIds = new Set<string>();
    let predicateGroupId = predicate.rowLevelPermissionPredicateGroupId;

    while (isDefined(predicateGroupId)) {
      const predicateGroup = rulePredicateGroupById.get(predicateGroupId);

      if (
        !isDefined(predicateGroup) ||
        visitedPredicateGroupIds.has(predicateGroupId)
      ) {
        return false;
      }

      visitedPredicateGroupIds.add(predicateGroupId);
      predicateGroupId =
        predicateGroup.parentRowLevelPermissionPredicateGroupId;
    }

    return isPolicyAgentRelationHopPredicate({
      predicate,
      policyObjectMetadataId: policyObjectMetadata.id,
      flatFieldMetadataMaps,
      flatObjectMetadataMaps,
    });
  };

  return POLICY_OWNER_ROLES.flatMap(({ roleName, universalIdentifier }) => {
    const role = roles.find(
      (candidateRole) =>
        candidateRole.universalIdentifier === universalIdentifier,
    );

    if (!isDefined(role)) {
      return [];
    }

    const objectRecordsPermissions =
      rolesPermissions[role.id]?.objects[policyObjectMetadata.id];
    const policyRules = rules.filter(
      ({ roleId, objectMetadataId }) =>
        roleId === role.id && objectMetadataId === policyObjectMetadata.id,
    );
    const toViolation = (
      problem: string,
      ruleIds: string[] = [],
    ): OmniaPermissionsViolation => ({
      check: OMNIA_PERMISSIONS_CHECK.policyAgentOwnership,
      message: `${roleName} role ${role.id} on policy: ${problem}`,
      ids: [role.id, policyObjectMetadata.id, ...ruleIds],
    });

    const readViolations = canReachAllRecords({
      objectRecordsPermissions,
      operationType: 'read',
    })
      ? []
      : [toViolation('read must reach every policy through the object grant')];

    const writeViolations = writeOperationTypes.flatMap((operationType) => {
      const grantingRules = policyRules.filter((rule) =>
        isRowLevelRecordsPermissionsRuleGrantingOperation({
          rule,
          operationType,
        }),
      );
      const nonHopRuleIds = grantingRules
        .filter((rule) => !isAgentRelationHopRule(rule))
        .map(({ id }) => id);

      return [
        ...(canReachAllRecords({ objectRecordsPermissions, operationType })
          ? [
              toViolation(
                `${operationType} reaches every policy through the object grant instead of the agent rule`,
              ),
            ]
          : []),
        ...(ownedWriteOperationTypes.includes(operationType) &&
        grantingRules.length === 0
          ? [
              toViolation(
                `no row level permission rule grants ${operationType}, so agents cannot ${operationType} their own policies`,
              ),
            ]
          : []),
        ...(nonHopRuleIds.length > 0
          ? [
              toViolation(
                `rule(s) granting ${operationType} must hold only the policy.agent -> agentProfile.workspaceMember relation hop predicate`,
                nonHopRuleIds,
              ),
            ]
          : []),
      ];
    });

    return [...readViolations, ...writeViolations];
  });
};
