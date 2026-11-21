import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import {
  type ObjectRecordsPermissions,
  RowLevelPermissionPredicateGroupLogicalOperator,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type ScopedRowLevelPermissionTranslationPlan } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-plan.type';
import {
  type ScopedRowLevelPermissionPredicateGroupRow,
  type ScopedRowLevelPermissionPredicateRow,
  type ScopedRowLevelPermissionTranslationSource,
} from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-source.type';
import { planScopedRowLevelPermissionTranslation } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/plan-scoped-row-level-permission-translation.util';
import {
  buildObjectRecordsPermissionsMock,
  VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
  VERIFY_PERMISSIONS_FLAT_FIELD_METADATAS,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/brokerage-agent-role-universal-identifier.constant';
import { findPhiAllRecordsGrantViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-phi-all-records-grant-violations.util';
import { findPolicyAgentOwnershipViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-policy-agent-ownership-violations.util';
import { findRowLevelPermissionRuleMatchingEveryRecordViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-matching-every-record-violations.util';
import { findRowLevelPermissionRuleWithoutGrantViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-without-grant-violations.util';
import { findRowLevelPermissionTreeIntegrityViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-tree-integrity-violations.util';
import { findUnlinkedRowLevelPermissionViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-unlinked-row-level-permission-violations.util';
import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';
import { isMorphOrRelationFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-morph-or-relation-flat-field-metadata.util';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';

const WORKSPACE_ID = '20202020-1000-4000-8000-000000000001';
const CUSTOM_APPLICATION_ID = 'custom-application-id';
const CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-1000-4000-8000-000000000012';
const INVESTOR_ROLE_ID = 'investor-role-id';

const ROLES = [
  {
    id: VERIFY_PERMISSIONS_IDS.memberRole,
    universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
    applicationId: CUSTOM_APPLICATION_ID,
    label: 'Member',
  },
  {
    id: VERIFY_PERMISSIONS_IDS.agentRole,
    universalIdentifier: BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
    applicationId: CUSTOM_APPLICATION_ID,
    label: 'Agent',
  },
  {
    id: INVESTOR_ROLE_ID,
    universalIdentifier: 'investor-role-universal-identifier',
    applicationId: CUSTOM_APPLICATION_ID,
    label: 'Investor',
  },
];

// The loader reads settings.relationType as text, so the shared enum value maps onto the server one by value
const toTranslationRelationType = (
  relationTypeName: string | undefined,
): RelationType | null =>
  Object.values(RelationType).find(
    (relationType) => relationType === relationTypeName,
  ) ?? null;

const buildPolicyAgentIsMePredicate = ({
  id,
  roleId,
  rowLevelPermissionPredicateGroupId,
}: Pick<
  ScopedRowLevelPermissionPredicateRow,
  'id' | 'roleId' | 'rowLevelPermissionPredicateGroupId'
>): ScopedRowLevelPermissionPredicateRow => ({
  id,
  universalIdentifier: `${id}-universal-identifier`,
  applicationId: CUSTOM_APPLICATION_ID,
  roleId,
  objectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
  fieldMetadataId: VERIFY_PERMISSIONS_IDS.policyAgentField,
  relationFieldMetadataId: null,
  workspaceMemberFieldMetadataId: VERIFY_PERMISSIONS_IDS.workspaceMemberIdField,
  operand: RowLevelPermissionPredicateOperand.IS,
  subFieldName: null,
  rowLevelPermissionPredicateGroupId,
  rowLevelPermissionRuleId: null,
  scope: 'WRITE',
});

const buildPolicyRootGroup = ({
  id,
  roleId,
}: Pick<
  ScopedRowLevelPermissionPredicateGroupRow,
  'id' | 'roleId'
>): ScopedRowLevelPermissionPredicateGroupRow => ({
  id,
  universalIdentifier: `${id}-universal-identifier`,
  applicationId: CUSTOM_APPLICATION_ID,
  roleId,
  objectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
  parentRowLevelPermissionPredicateGroupId: null,
  rowLevelPermissionRuleId: null,
  scope: 'WRITE',
  isDeleted: false,
});

// Member: settings root group around the predicate. Agent: ungrouped predicate beside an empty root group.
// Investor: settings shape on a role that may not write policies.
const SOURCE: ScopedRowLevelPermissionTranslationSource = {
  predicates: [
    buildPolicyAgentIsMePredicate({
      id: 'member-policy-predicate-id',
      roleId: VERIFY_PERMISSIONS_IDS.memberRole,
      rowLevelPermissionPredicateGroupId: 'member-policy-root-group-id',
    }),
    buildPolicyAgentIsMePredicate({
      id: 'agent-policy-predicate-id',
      roleId: VERIFY_PERMISSIONS_IDS.agentRole,
      rowLevelPermissionPredicateGroupId: null,
    }),
    buildPolicyAgentIsMePredicate({
      id: 'investor-policy-predicate-id',
      roleId: INVESTOR_ROLE_ID,
      rowLevelPermissionPredicateGroupId: 'investor-policy-root-group-id',
    }),
  ],
  predicateGroups: [
    buildPolicyRootGroup({
      id: 'member-policy-root-group-id',
      roleId: VERIFY_PERMISSIONS_IDS.memberRole,
    }),
    buildPolicyRootGroup({
      id: 'agent-policy-empty-group-id',
      roleId: VERIFY_PERMISSIONS_IDS.agentRole,
    }),
    buildPolicyRootGroup({
      id: 'investor-policy-root-group-id',
      roleId: INVESTOR_ROLE_ID,
    }),
  ],
  rowLevelPermissionRules: [],
  roles: ROLES,
  objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS.map(
    ({ id, universalIdentifier, nameSingular }) => ({
      id,
      universalIdentifier,
      nameSingular,
    }),
  ),
  fieldMetadatas: VERIFY_PERMISSIONS_FLAT_FIELD_METADATAS.map(
    (flatFieldMetadata) => ({
      id: flatFieldMetadata.id,
      objectMetadataId: flatFieldMetadata.objectMetadataId,
      name: flatFieldMetadata.name,
      type: flatFieldMetadata.type,
      isActive: flatFieldMetadata.isActive,
      relationTargetObjectMetadataId:
        flatFieldMetadata.relationTargetObjectMetadataId ?? null,
      relationType: isMorphOrRelationFlatFieldMetadata(flatFieldMetadata)
        ? toTranslationRelationType(flatFieldMetadata.settings?.relationType)
        : null,
    }),
  ),
  applications: [
    {
      id: CUSTOM_APPLICATION_ID,
      universalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    },
  ],
  fieldPermissions: [],
  featureFlags: {},
};

const buildRoleRecordsPermissions = (
  policyRecordsPermissions: ObjectRecordsPermissions,
): RoleRecordsPermissions => ({
  canReadAllRecords: true,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  objects: {
    [VERIFY_PERMISSIONS_IDS.policyObject]: policyRecordsPermissions,
  },
});

const AGENT_PRE_RULE_RECORDS_PERMISSIONS = buildObjectRecordsPermissionsMock({
  canCreateAllRecords: true,
  canReadAllRecords: true,
  canUpdateAllRecords: true,
});

const PRE_RULE_ROLES_PERMISSIONS: Record<string, RoleRecordsPermissions> = {
  [VERIFY_PERMISSIONS_IDS.memberRole]: buildRoleRecordsPermissions(
    AGENT_PRE_RULE_RECORDS_PERMISSIONS,
  ),
  [VERIFY_PERMISSIONS_IDS.agentRole]: buildRoleRecordsPermissions(
    AGENT_PRE_RULE_RECORDS_PERMISSIONS,
  ),
  [INVESTOR_ROLE_ID]: buildRoleRecordsPermissions(
    buildObjectRecordsPermissionsMock({ canReadAllRecords: true }),
  ),
};

// The rows W9 reads once the applier has written the plan
const buildTranslatedWorkspace = (
  translationPlan: ScopedRowLevelPermissionTranslationPlan,
) => {
  const predicateUpdateById = new Map(
    translationPlan.predicateUpdates.map((update) => [update.id, update]),
  );
  const predicateGroupUpdateById = new Map(
    translationPlan.predicateGroupUpdates.map((update) => [update.id, update]),
  );
  const softDeletedPredicateIds = new Set(
    translationPlan.predicateIdsToSoftDelete,
  );
  const softDeletedPredicateGroupIds = new Set(
    translationPlan.predicateGroupIdsToSoftDelete,
  );

  const predicates = SOURCE.predicates
    .filter(({ id }) => !softDeletedPredicateIds.has(id))
    .map((predicate) => {
      const update = predicateUpdateById.get(predicate.id);

      return {
        id: predicate.id,
        roleId: predicate.roleId,
        objectMetadataId: predicate.objectMetadataId,
        fieldMetadataId: update?.fieldMetadataId ?? predicate.fieldMetadataId,
        relationFieldMetadataId: isDefined(update)
          ? update.relationFieldMetadataId
          : predicate.relationFieldMetadataId,
        workspaceMemberFieldMetadataId: isDefined(update)
          ? update.workspaceMemberFieldMetadataId
          : predicate.workspaceMemberFieldMetadataId,
        operand: RowLevelPermissionPredicateOperand.IS,
        value: null,
        subFieldName: null,
        workspaceMemberSubFieldName: null,
        rowLevelPermissionPredicateGroupId: isDefined(update)
          ? update.rowLevelPermissionPredicateGroupId
          : predicate.rowLevelPermissionPredicateGroupId,
        rowLevelPermissionRuleId: update?.rowLevelPermissionRuleId ?? null,
      };
    });

  const toPredicateGroup = ({
    id,
    roleId,
    objectMetadataId,
    parentRowLevelPermissionPredicateGroupId,
    rowLevelPermissionRuleId,
  }: {
    id: string;
    roleId: string;
    objectMetadataId: string;
    parentRowLevelPermissionPredicateGroupId: string | null;
    rowLevelPermissionRuleId: string | null;
  }) => ({
    id,
    roleId,
    objectMetadataId,
    parentRowLevelPermissionPredicateGroupId,
    rowLevelPermissionRuleId,
    logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.AND,
    positionInRowLevelPermissionPredicateGroup: null,
    canReadRecords: false,
    canUpdateRecords: false,
    canSoftDeleteRecords: false,
    canDestroyRecords: false,
    deletedAt: null,
  });

  const predicateGroups = [
    ...SOURCE.predicateGroups
      .filter(({ id }) => !softDeletedPredicateGroupIds.has(id))
      .map((predicateGroup) => {
        const update = predicateGroupUpdateById.get(predicateGroup.id);

        return toPredicateGroup({
          ...predicateGroup,
          parentRowLevelPermissionPredicateGroupId: isDefined(update)
            ? update.parentRowLevelPermissionPredicateGroupId
            : predicateGroup.parentRowLevelPermissionPredicateGroupId,
          rowLevelPermissionRuleId: update?.rowLevelPermissionRuleId ?? null,
        });
      }),
    ...translationPlan.rootPredicateGroupsToInsert.map((rootPredicateGroup) =>
      toPredicateGroup({
        ...rootPredicateGroup,
        parentRowLevelPermissionPredicateGroupId: null,
      }),
    ),
  ];

  const rules = translationPlan.rowLevelPermissionRulesToInsert.map(
    ({ id, roleId, objectMetadataId, grants }) => ({
      id,
      roleId,
      objectMetadataId,
      ...grants,
    }),
  );

  const rolesPermissions = Object.fromEntries(
    translationPlan.objectPermissionGrantsUpserts.map(({ roleId, grants }) => [
      roleId,
      buildRoleRecordsPermissions(
        buildObjectRecordsPermissionsMock({
          canCreateAllRecords: grants.canCreateObjectRecords,
          canReadAllRecords: grants.canReadObjectRecords,
          canUpdateAllRecords: grants.canUpdateObjectRecords,
          canSoftDeleteAllRecords: grants.canSoftDeleteObjectRecords,
          canDestroyAllRecords: grants.canDestroyObjectRecords,
        }),
      ),
    ]),
  );

  return { predicates, predicateGroups, rules, rolesPermissions };
};

describe('W1 translation of prod-shaped Policy rules, then W9 verification', () => {
  const translationPlan = planScopedRowLevelPermissionTranslation({
    workspaceId: WORKSPACE_ID,
    source: SOURCE,
    rolesPermissions: PRE_RULE_ROLES_PERMISSIONS,
    shouldMergeMixedScopesFailClosed: false,
  });
  const { predicates, predicateGroups, rules, rolesPermissions } =
    buildTranslatedWorkspace(translationPlan);

  it('translates Member and Agent into hop rules and removes the Investor predicate that granted nothing', () => {
    expect(translationPlan.aborts).toEqual([]);
    expect(
      translationPlan.rowLevelPermissionRulesToInsert.map(
        ({ roleId }) => roleId,
      ),
    ).toEqual([
      VERIFY_PERMISSIONS_IDS.agentRole,
      VERIFY_PERMISSIONS_IDS.memberRole,
    ]);
    expect(translationPlan.predicateIdsToSoftDelete).toEqual([
      'investor-policy-predicate-id',
    ]);
    expect(translationPlan.predicateGroupIdsToSoftDelete).toEqual([
      'investor-policy-root-group-id',
    ]);
    expect(
      rolesPermissions[INVESTOR_ROLE_ID]?.objects[
        VERIFY_PERMISSIONS_IDS.policyObject
      ]?.canReadAllRecords,
    ).toBe(true);
  });

  it('passes every W9 rule and policy ownership check', () => {
    expect([
      ...findUnlinkedRowLevelPermissionViolations({
        predicates,
        predicateGroups,
        rules,
      }),
      ...findRowLevelPermissionRuleWithoutGrantViolations({ rules }),
      ...findRowLevelPermissionTreeIntegrityViolations({
        predicates,
        predicateGroups,
      }),
      ...findRowLevelPermissionRuleMatchingEveryRecordViolations({
        rules,
        predicates,
        predicateGroups,
        flatFieldMetadataMaps: VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
        flatObjectMetadataMaps: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
      }),
      ...findPhiAllRecordsGrantViolations({
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        rules,
        rolesPermissions,
        featureFlagsMap: {},
      }),
      ...findPolicyAgentOwnershipViolations({
        roles: ROLES,
        objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
        rules,
        predicates,
        predicateGroups,
        flatFieldMetadataMaps: VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
        flatObjectMetadataMaps: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
        rolesPermissions,
        featureFlagsMap: {},
      }),
    ]).toEqual([]);
  });
});
