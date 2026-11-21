import {
  getObjectPermissionUniversalIdentifier,
  getRowLevelPermissionRuleUniversalIdentifier,
} from 'twenty-shared/application';
import {
  FeatureFlagKey,
  FieldMetadataType,
  type ObjectRecordsPermissions,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import {
  type ScopedRowLevelPermissionPredicateGroupRow,
  type ScopedRowLevelPermissionPredicateRow,
  type ScopedRowLevelPermissionTranslationSource,
  type TranslationFieldMetadataRow,
} from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-source.type';
import { type ScopedRowLevelPermissionTranslationPlan } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-plan.type';
import { planScopedRowLevelPermissionTranslation } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/plan-scoped-row-level-permission-translation.util';
import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';
import { buildRowLevelPermissionRules } from 'src/engine/metadata-modules/row-level-permission-predicate/utils/build-row-level-permission-rules.util';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';

const WORKSPACE_ID = '20202020-1000-4000-8000-000000000001';
const CUSTOM_APPLICATION_ID = '20202020-1000-4000-8000-000000000011';
const CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-1000-4000-8000-000000000012';
const OTHER_APPLICATION_ID = '20202020-1000-4000-8000-000000000013';
const OTHER_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-1000-4000-8000-000000000014';

const MEMBER_ROLE_ID = '20202020-2000-4000-8000-000000000001';
const MEMBER_ROLE_UNIVERSAL_IDENTIFIER = '20202020-2000-4000-8000-000000000002';
const OTHER_ROLE_ID = '20202020-2000-4000-8000-000000000003';

const WORKSPACE_MEMBER_OBJECT_ID = '20202020-3000-4000-8000-000000000001';
const POLICY_OBJECT_ID = '20202020-3000-4000-8000-000000000003';
const POLICY_OBJECT_UNIVERSAL_IDENTIFIER =
  '20202020-3000-4000-8000-000000000004';
const AGENT_PROFILE_OBJECT_ID = '20202020-3000-4000-8000-000000000005';
const DASHBOARD_OBJECT_ID = '20202020-3000-4000-8000-000000000007';
const PERSON_OBJECT_ID = '20202020-3000-4000-8000-000000000009';
const PERSON_OBJECT_UNIVERSAL_IDENTIFIER =
  '20202020-3000-4000-8000-00000000000a';

const WORKSPACE_MEMBER_ID_FIELD_ID = '20202020-4000-4000-8000-000000000001';
const POLICY_AGENT_FIELD_ID = '20202020-4000-4000-8000-000000000002';
const AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID =
  '20202020-4000-4000-8000-000000000003';
const DASHBOARD_AUDIENCE_FIELD_ID = '20202020-4000-4000-8000-000000000004';
const PERSON_ASSIGNEE_FIELD_ID = '20202020-4000-4000-8000-000000000005';
const PERSON_CITY_FIELD_ID = '20202020-4000-4000-8000-000000000006';
const AGENT_PROFILE_MANAGER_FIELD_ID = '20202020-4000-4000-8000-000000000007';

const PREDICATE_ID = '20202020-5000-4000-8000-000000000001';
const SECOND_PREDICATE_ID = '20202020-5000-4000-8000-000000000002';
const THIRD_PREDICATE_ID = '20202020-5000-4000-8000-000000000003';
const ROOT_GROUP_ID = '20202020-6000-4000-8000-000000000001';
const SECOND_ROOT_GROUP_ID = '20202020-6000-4000-8000-000000000002';
const FIELD_PERMISSION_ID = '20202020-7000-4000-8000-000000000001';

const buildFieldMetadata = (
  fieldMetadata: Pick<
    TranslationFieldMetadataRow,
    'id' | 'objectMetadataId' | 'name' | 'type'
  > &
    Partial<TranslationFieldMetadataRow>,
): TranslationFieldMetadataRow => ({
  isActive: true,
  relationTargetObjectMetadataId: null,
  relationType: null,
  ...fieldMetadata,
});

const BASE_FIELD_METADATAS: TranslationFieldMetadataRow[] = [
  buildFieldMetadata({
    id: WORKSPACE_MEMBER_ID_FIELD_ID,
    objectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    name: 'id',
    type: FieldMetadataType.UUID,
  }),
  buildFieldMetadata({
    id: POLICY_AGENT_FIELD_ID,
    objectMetadataId: POLICY_OBJECT_ID,
    name: 'agent',
    type: FieldMetadataType.RELATION,
    relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationType: RelationType.MANY_TO_ONE,
  }),
  buildFieldMetadata({
    id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    name: 'workspaceMember',
    type: FieldMetadataType.RELATION,
    relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    relationType: RelationType.MANY_TO_ONE,
  }),
  buildFieldMetadata({
    id: DASHBOARD_AUDIENCE_FIELD_ID,
    objectMetadataId: DASHBOARD_OBJECT_ID,
    name: 'audience',
    type: FieldMetadataType.MULTI_SELECT,
  }),
  buildFieldMetadata({
    id: PERSON_ASSIGNEE_FIELD_ID,
    objectMetadataId: PERSON_OBJECT_ID,
    name: 'assignee',
    type: FieldMetadataType.RELATION,
    relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    relationType: RelationType.MANY_TO_ONE,
  }),
  buildFieldMetadata({
    id: PERSON_CITY_FIELD_ID,
    objectMetadataId: PERSON_OBJECT_ID,
    name: 'city',
    type: FieldMetadataType.TEXT,
  }),
];

const RECORDS_PERMISSIONS: ObjectRecordsPermissions = {
  canCreateAllRecords: true,
  canReadAllRecords: true,
  canUpdateAllRecords: true,
  canSoftDeleteAllRecords: true,
  canDestroyAllRecords: false,
  unreadableFields: [],
  uneditableFields: [],
};

const ROLES_PERMISSIONS: Record<string, RoleRecordsPermissions> = {
  [MEMBER_ROLE_ID]: {
    canReadAllRecords: true,
    canUpdateAllRecords: true,
    canSoftDeleteAllRecords: true,
    canDestroyAllRecords: false,
    objects: {
      [POLICY_OBJECT_ID]: RECORDS_PERMISSIONS,
      [PERSON_OBJECT_ID]: RECORDS_PERMISSIONS,
      [DASHBOARD_OBJECT_ID]: RECORDS_PERMISSIONS,
    },
  },
};

const buildPredicate = (
  predicate: Pick<
    ScopedRowLevelPermissionPredicateRow,
    'id' | 'objectMetadataId' | 'fieldMetadataId'
  > &
    Partial<ScopedRowLevelPermissionPredicateRow>,
): ScopedRowLevelPermissionPredicateRow => ({
  universalIdentifier: predicate.id.replace('5000', '5100'),
  applicationId: CUSTOM_APPLICATION_ID,
  roleId: MEMBER_ROLE_ID,
  relationFieldMetadataId: null,
  workspaceMemberFieldMetadataId: null,
  operand: RowLevelPermissionPredicateOperand.IS,
  subFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
  rowLevelPermissionRuleId: null,
  scope: 'ALL',
  ...predicate,
});

const buildPredicateGroup = (
  predicateGroup: Pick<
    ScopedRowLevelPermissionPredicateGroupRow,
    'id' | 'objectMetadataId'
  > &
    Partial<ScopedRowLevelPermissionPredicateGroupRow>,
): ScopedRowLevelPermissionPredicateGroupRow => ({
  universalIdentifier: predicateGroup.id.replace('6000', '6100'),
  applicationId: CUSTOM_APPLICATION_ID,
  roleId: MEMBER_ROLE_ID,
  parentRowLevelPermissionPredicateGroupId: null,
  rowLevelPermissionRuleId: null,
  scope: 'ALL',
  isDeleted: false,
  ...predicateGroup,
});

const buildPolicyAgentIsMePredicate = (
  predicate: Partial<ScopedRowLevelPermissionPredicateRow> = {},
) =>
  buildPredicate({
    id: PREDICATE_ID,
    objectMetadataId: POLICY_OBJECT_ID,
    fieldMetadataId: POLICY_AGENT_FIELD_ID,
    workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
    scope: 'WRITE',
    ...predicate,
  });

const buildSource = (
  source: Partial<ScopedRowLevelPermissionTranslationSource>,
): ScopedRowLevelPermissionTranslationSource => ({
  predicates: [],
  predicateGroups: [],
  rowLevelPermissionRules: [],
  roles: [
    {
      id: MEMBER_ROLE_ID,
      universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
      applicationId: CUSTOM_APPLICATION_ID,
      label: 'Member',
    },
    {
      id: OTHER_ROLE_ID,
      universalIdentifier: '20202020-2000-4000-8000-000000000004',
      applicationId: CUSTOM_APPLICATION_ID,
      label: 'Other',
    },
  ],
  objectMetadatas: [
    {
      id: WORKSPACE_MEMBER_OBJECT_ID,
      universalIdentifier: '20202020-3000-4000-8000-000000000002',
      nameSingular: 'workspaceMember',
    },
    {
      id: POLICY_OBJECT_ID,
      universalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      nameSingular: 'policy',
    },
    {
      id: AGENT_PROFILE_OBJECT_ID,
      universalIdentifier: '20202020-3000-4000-8000-000000000006',
      nameSingular: 'agentProfile',
    },
    {
      id: DASHBOARD_OBJECT_ID,
      universalIdentifier: '20202020-3000-4000-8000-000000000008',
      nameSingular: 'dashboard',
    },
    {
      id: PERSON_OBJECT_ID,
      universalIdentifier: PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
      nameSingular: 'person',
    },
  ],
  fieldMetadatas: BASE_FIELD_METADATAS,
  applications: [
    {
      id: CUSTOM_APPLICATION_ID,
      universalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    },
    {
      id: OTHER_APPLICATION_ID,
      universalIdentifier: OTHER_APPLICATION_UNIVERSAL_IDENTIFIER,
    },
  ],
  fieldPermissions: [],
  featureFlags: {},
  ...source,
});

const plan = (
  source: ScopedRowLevelPermissionTranslationSource,
  shouldMergeMixedScopesFailClosed = false,
  rolesPermissions: Record<string, RoleRecordsPermissions> = ROLES_PERMISSIONS,
) =>
  planScopedRowLevelPermissionTranslation({
    workspaceId: WORKSPACE_ID,
    source,
    rolesPermissions,
    shouldMergeMixedScopesFailClosed,
  });

// Investor-like role: reads every record of the object and may not change any
const READ_ONLY_ROLES_PERMISSIONS: Record<string, RoleRecordsPermissions> = {
  [MEMBER_ROLE_ID]: {
    canReadAllRecords: true,
    canUpdateAllRecords: false,
    canSoftDeleteAllRecords: false,
    canDestroyAllRecords: false,
    objects: {
      [POLICY_OBJECT_ID]: {
        ...RECORDS_PERMISSIONS,
        canCreateAllRecords: false,
        canUpdateAllRecords: false,
        canSoftDeleteAllRecords: false,
      },
    },
  },
};

const expectNoWrites = (
  translationPlan: ScopedRowLevelPermissionTranslationPlan,
) => {
  expect(translationPlan.rowLevelPermissionRulesToInsert).toEqual([]);
  expect(translationPlan.objectPermissionGrantsUpserts).toEqual([]);
  expect(translationPlan.predicateUpdates).toEqual([]);
  expect(translationPlan.predicateIdsToSoftDelete).toEqual([]);
  expect(translationPlan.predicateGroupIdsToSoftDelete).toEqual([]);
};

const AGENT_PROFILE_MANAGER_FIELD_METADATA = buildFieldMetadata({
  id: AGENT_PROFILE_MANAGER_FIELD_ID,
  objectMetadataId: AGENT_PROFILE_OBJECT_ID,
  name: 'manager',
  type: FieldMetadataType.RELATION,
  relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
  relationType: RelationType.MANY_TO_ONE,
});

// What the applier writes, replayed on the rows the loader would read next time
const applyPlanToSource = (
  source: ScopedRowLevelPermissionTranslationSource,
  translationPlan: ScopedRowLevelPermissionTranslationPlan,
): ScopedRowLevelPermissionTranslationSource => {
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

  return {
    ...source,
    predicates: source.predicates
      .filter(({ id }) => !softDeletedPredicateIds.has(id))
      .map((predicate) => {
        const update = predicateUpdateById.get(predicate.id);

        return isDefined(update)
          ? {
              ...predicate,
              fieldMetadataId: update.fieldMetadataId,
              relationFieldMetadataId: update.relationFieldMetadataId,
              workspaceMemberFieldMetadataId:
                update.workspaceMemberFieldMetadataId,
              rowLevelPermissionPredicateGroupId:
                update.rowLevelPermissionPredicateGroupId,
              rowLevelPermissionRuleId: update.rowLevelPermissionRuleId,
            }
          : predicate;
      }),
    predicateGroups: [
      ...source.predicateGroups.map((predicateGroup) => {
        const update = predicateGroupUpdateById.get(predicateGroup.id);

        if (softDeletedPredicateGroupIds.has(predicateGroup.id)) {
          return { ...predicateGroup, isDeleted: true };
        }

        return isDefined(update)
          ? {
              ...predicateGroup,
              parentRowLevelPermissionPredicateGroupId:
                update.parentRowLevelPermissionPredicateGroupId,
              rowLevelPermissionRuleId: update.rowLevelPermissionRuleId,
            }
          : predicateGroup;
      }),
      ...translationPlan.rootPredicateGroupsToInsert.map(
        (rootPredicateGroup) => ({
          id: rootPredicateGroup.id,
          universalIdentifier: rootPredicateGroup.universalIdentifier,
          applicationId: rootPredicateGroup.applicationId,
          roleId: rootPredicateGroup.roleId,
          objectMetadataId: rootPredicateGroup.objectMetadataId,
          parentRowLevelPermissionPredicateGroupId: null,
          rowLevelPermissionRuleId: rootPredicateGroup.rowLevelPermissionRuleId,
          scope: rootPredicateGroup.scope,
          isDeleted: false,
        }),
      ),
    ],
    rowLevelPermissionRules: [
      ...source.rowLevelPermissionRules,
      ...translationPlan.rowLevelPermissionRulesToInsert.map(
        ({ id, roleId, objectMetadataId }) => ({
          id,
          roleId,
          objectMetadataId,
        }),
      ),
    ],
    featureFlags: translationPlan.shouldEnableRelationHop
      ? {
          ...source.featureFlags,
          [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: true,
        }
      : source.featureFlags,
  };
};

describe('planScopedRowLevelPermissionTranslation', () => {
  it('turns a write-only Policy "agent is me" predicate into a hop rule while every policy stays readable', () => {
    const translationPlan = plan(
      buildSource({ predicates: [buildPolicyAgentIsMePredicate()] }),
    );

    const [rule] = translationPlan.rowLevelPermissionRulesToInsert;

    expect(translationPlan.aborts).toEqual([]);
    expect(translationPlan.rowLevelPermissionRulesToInsert).toHaveLength(1);
    expect(rule).toMatchObject({
      universalIdentifier: getRowLevelPermissionRuleUniversalIdentifier({
        applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
        roleUniversalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
        objectMetadataUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
        rootRowLevelPermissionPredicateGroupUniversalIdentifier: null,
      }),
      applicationId: CUSTOM_APPLICATION_ID,
      roleId: MEMBER_ROLE_ID,
      objectMetadataId: POLICY_OBJECT_ID,
      grants: {
        canCreateRecords: true,
        canReadRecords: false,
        canUpdateRecords: true,
        canSoftDeleteRecords: true,
        canDestroyRecords: false,
      },
    });
    expect(translationPlan.objectPermissionGrantsUpserts).toEqual([
      {
        universalIdentifier: getObjectPermissionUniversalIdentifier({
          applicationUniversalIdentifier:
            CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
          roleUniversalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
          objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
        }),
        applicationId: CUSTOM_APPLICATION_ID,
        roleId: MEMBER_ROLE_ID,
        objectMetadataId: POLICY_OBJECT_ID,
        grants: {
          canCreateObjectRecords: false,
          canReadObjectRecords: true,
          canUpdateObjectRecords: false,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: false,
        },
      },
    ]);
    expect(translationPlan.predicateUpdates).toEqual([
      {
        id: PREDICATE_ID,
        relationFieldMetadataId: POLICY_AGENT_FIELD_ID,
        fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
        isConvertedToRelationHop: true,
        rowLevelPermissionPredicateGroupId: null,
        rowLevelPermissionRuleId: rule.id,
      },
    ]);
    expect(translationPlan.rootPredicateGroupsToInsert).toEqual([]);
    expect(translationPlan.shouldEnableRelationHop).toBe(true);
  });

  it('converts a legacy member field on the linked object into the same hop', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPolicyAgentIsMePredicate({
            workspaceMemberFieldMetadataId:
              AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
          }),
        ],
      }),
    );

    expect(translationPlan.aborts).toEqual([]);
    expect(translationPlan.predicateUpdates[0]).toMatchObject({
      relationFieldMetadataId: POLICY_AGENT_FIELD_ID,
      fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
      workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
      isConvertedToRelationHop: true,
    });
  });

  it('converts a read-only dashboard audience predicate like an all-operations one', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPredicate({
            id: PREDICATE_ID,
            objectMetadataId: DASHBOARD_OBJECT_ID,
            fieldMetadataId: DASHBOARD_AUDIENCE_FIELD_ID,
            operand: RowLevelPermissionPredicateOperand.CONTAINS,
            scope: 'READ',
          }),
        ],
      }),
    );

    expect(translationPlan.aborts).toEqual([]);
    expect(translationPlan.rowLevelPermissionRulesToInsert[0].grants).toEqual({
      canCreateRecords: true,
      canReadRecords: true,
      canUpdateRecords: true,
      canSoftDeleteRecords: true,
      canDestroyRecords: false,
    });
    expect(translationPlan.objectPermissionGrantsUpserts[0].grants).toEqual({
      canCreateObjectRecords: false,
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
    expect(translationPlan.predicateUpdates[0].isConvertedToRelationHop).toBe(
      false,
    );
    expect(translationPlan.shouldEnableRelationHop).toBe(false);
  });

  it('keeps a single lead root group as the rule root and mirrors the grants onto it', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPredicate({
            id: PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_ASSIGNEE_FIELD_ID,
            workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
            rowLevelPermissionPredicateGroupId: ROOT_GROUP_ID,
          }),
        ],
        predicateGroups: [
          buildPredicateGroup({
            id: ROOT_GROUP_ID,
            objectMetadataId: PERSON_OBJECT_ID,
          }),
        ],
      }),
    );

    const [rule] = translationPlan.rowLevelPermissionRulesToInsert;

    expect(translationPlan.aborts).toEqual([]);
    expect(rule.universalIdentifier).toBe(
      getRowLevelPermissionRuleUniversalIdentifier({
        applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
        roleUniversalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
        objectMetadataUniversalIdentifier: PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
        rootRowLevelPermissionPredicateGroupUniversalIdentifier:
          ROOT_GROUP_ID.replace('6000', '6100'),
      }),
    );
    expect(translationPlan.predicateGroupUpdates).toEqual([
      {
        id: ROOT_GROUP_ID,
        parentRowLevelPermissionPredicateGroupId: null,
        rowLevelPermissionRuleId: rule.id,
        grants: rule.grants,
      },
    ]);
    expect(translationPlan.objectPermissionGrantsUpserts[0].grants).toEqual(
      expect.objectContaining({ canReadObjectRecords: false }),
    );
    expect(translationPlan.predicateUpdates[0].isConvertedToRelationHop).toBe(
      false,
    );
  });

  it('re-parents several root trees under one AND root group that upstream reads as the only rule', () => {
    const source = buildSource({
      predicates: [
        buildPredicate({
          id: PREDICATE_ID,
          objectMetadataId: PERSON_OBJECT_ID,
          fieldMetadataId: PERSON_ASSIGNEE_FIELD_ID,
          workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
          rowLevelPermissionPredicateGroupId: ROOT_GROUP_ID,
        }),
        buildPredicate({
          id: SECOND_PREDICATE_ID,
          objectMetadataId: PERSON_OBJECT_ID,
          fieldMetadataId: PERSON_CITY_FIELD_ID,
          operand: RowLevelPermissionPredicateOperand.CONTAINS,
          rowLevelPermissionPredicateGroupId: SECOND_ROOT_GROUP_ID,
        }),
        buildPredicate({
          id: THIRD_PREDICATE_ID,
          objectMetadataId: PERSON_OBJECT_ID,
          fieldMetadataId: PERSON_CITY_FIELD_ID,
          operand: RowLevelPermissionPredicateOperand.IS_NOT_EMPTY,
        }),
      ],
      predicateGroups: [
        buildPredicateGroup({
          id: ROOT_GROUP_ID,
          objectMetadataId: PERSON_OBJECT_ID,
        }),
        buildPredicateGroup({
          id: SECOND_ROOT_GROUP_ID,
          objectMetadataId: PERSON_OBJECT_ID,
        }),
      ],
      fieldPermissions: [
        {
          id: FIELD_PERMISSION_ID,
          roleId: MEMBER_ROLE_ID,
          objectMetadataId: PERSON_OBJECT_ID,
          rowLevelPermissionPredicateGroupId: SECOND_ROOT_GROUP_ID,
          rowLevelPermissionRuleId: null,
        },
      ],
    });

    const translationPlan = plan(source);
    const [rule] = translationPlan.rowLevelPermissionRulesToInsert;
    const [rootPredicateGroup] = translationPlan.rootPredicateGroupsToInsert;

    expect(translationPlan.aborts).toEqual([]);
    expect(translationPlan.rootPredicateGroupsToInsert).toHaveLength(1);
    expect(rootPredicateGroup).toMatchObject({
      applicationId: CUSTOM_APPLICATION_ID,
      rowLevelPermissionRuleId: rule.id,
      scope: 'ALL',
      grants: rule.grants,
    });
    expect(translationPlan.predicateGroupUpdates).toEqual(
      [ROOT_GROUP_ID, SECOND_ROOT_GROUP_ID].map((id) => ({
        id,
        parentRowLevelPermissionPredicateGroupId: rootPredicateGroup.id,
        rowLevelPermissionRuleId: rule.id,
        grants: {
          canCreateRecords: false,
          canReadRecords: false,
          canUpdateRecords: false,
          canSoftDeleteRecords: false,
          canDestroyRecords: false,
        },
      })),
    );
    expect(
      translationPlan.predicateUpdates.map(
        ({ id, rowLevelPermissionPredicateGroupId }) => [
          id,
          rowLevelPermissionPredicateGroupId,
        ],
      ),
    ).toEqual([
      [PREDICATE_ID, ROOT_GROUP_ID],
      [SECOND_PREDICATE_ID, SECOND_ROOT_GROUP_ID],
      [THIRD_PREDICATE_ID, rootPredicateGroup.id],
    ]);
    expect(translationPlan.fieldPermissionRuleLinks).toEqual([
      { id: FIELD_PERMISSION_ID, rowLevelPermissionRuleId: rule.id },
    ]);

    const translatedSource = applyPlanToSource(source, translationPlan);
    const universalIdentifierByPredicateGroupId = new Map(
      translatedSource.predicateGroups.map(({ id, universalIdentifier }) => [
        id,
        universalIdentifier,
      ]),
    );
    const owner = {
      applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
      roleUniversalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
      objectMetadataUniversalIdentifier: PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
    };
    const upstreamRules = buildRowLevelPermissionRules({
      predicateGroups: translatedSource.predicateGroups.map(
        (predicateGroup) => ({
          ...owner,
          universalIdentifier: predicateGroup.universalIdentifier,
          parentRowLevelPermissionPredicateGroupUniversalIdentifier: isDefined(
            predicateGroup.parentRowLevelPermissionPredicateGroupId,
          )
            ? (universalIdentifierByPredicateGroupId.get(
                predicateGroup.parentRowLevelPermissionPredicateGroupId,
              ) ?? null)
            : null,
        }),
      ),
      predicates: translatedSource.predicates.map((predicate) => ({
        ...owner,
        universalIdentifier: predicate.universalIdentifier,
        rowLevelPermissionPredicateGroupUniversalIdentifier: isDefined(
          predicate.rowLevelPermissionPredicateGroupId,
        )
          ? (universalIdentifierByPredicateGroupId.get(
              predicate.rowLevelPermissionPredicateGroupId,
            ) ?? null)
          : null,
      })),
      now: '2026-11-18T00:00:00.000Z',
    });

    expect(
      upstreamRules.rules.map(({ universalIdentifier }) => universalIdentifier),
    ).toEqual([rule.universalIdentifier]);
  });

  it('aborts a role and object that mixes scopes, naming every row', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPredicate({
            id: PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_ASSIGNEE_FIELD_ID,
            workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
          }),
          buildPredicate({
            id: SECOND_PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_CITY_FIELD_ID,
            operand: RowLevelPermissionPredicateOperand.IS_NOT_EMPTY,
            scope: 'WRITE',
          }),
        ],
      }),
    );

    expect(translationPlan.aborts).toEqual([
      expect.stringContaining(
        `role ${MEMBER_ROLE_ID} on object ${PERSON_OBJECT_ID} mixes scopes (ALL: predicates [${PREDICATE_ID}], groups []; WRITE: predicates [${SECOND_PREDICATE_ID}], groups [])`,
      ),
    ]);
    expectNoWrites(translationPlan);
  });

  it('merges mixed scopes fail-closed into one rule granting the previous access when asked to', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPredicate({
            id: PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_ASSIGNEE_FIELD_ID,
            workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
          }),
          buildPredicate({
            id: SECOND_PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_CITY_FIELD_ID,
            operand: RowLevelPermissionPredicateOperand.IS_NOT_EMPTY,
            scope: 'WRITE',
          }),
        ],
      }),
      true,
    );

    expect(translationPlan.aborts).toEqual([]);
    expect(translationPlan.rowLevelPermissionRulesToInsert).toHaveLength(1);
    expect(translationPlan.rowLevelPermissionRulesToInsert[0].grants).toEqual(
      expect.objectContaining({ canReadRecords: true, canUpdateRecords: true }),
    );
    expect(translationPlan.objectPermissionGrantsUpserts[0].grants).toEqual(
      expect.objectContaining({
        canReadObjectRecords: false,
        canUpdateObjectRecords: false,
      }),
    );
    expect(translationPlan.pairReports[0].warnings).toEqual([
      expect.stringContaining('merged fail-closed'),
    ]);
  });

  it('aborts a predicate that sits in a group of another role', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPolicyAgentIsMePredicate({
            rowLevelPermissionPredicateGroupId: ROOT_GROUP_ID,
          }),
        ],
        predicateGroups: [
          buildPredicateGroup({
            id: ROOT_GROUP_ID,
            objectMetadataId: POLICY_OBJECT_ID,
            roleId: OTHER_ROLE_ID,
            scope: 'WRITE',
          }),
        ],
      }),
    );

    expect(translationPlan.aborts).toContainEqual(
      expect.stringContaining(
        `Predicate ${PREDICATE_ID} of role ${MEMBER_ROLE_ID} on object ${POLICY_OBJECT_ID} is in group ${ROOT_GROUP_ID} of role ${OTHER_ROLE_ID}`,
      ),
    );
  });

  it('aborts a group whose parent belongs to another role, or is deleted', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPredicate({
            id: PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_CITY_FIELD_ID,
            operand: RowLevelPermissionPredicateOperand.IS_NOT_EMPTY,
            rowLevelPermissionPredicateGroupId: SECOND_ROOT_GROUP_ID,
          }),
        ],
        predicateGroups: [
          buildPredicateGroup({
            id: ROOT_GROUP_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            roleId: OTHER_ROLE_ID,
          }),
          buildPredicateGroup({
            id: SECOND_ROOT_GROUP_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            parentRowLevelPermissionPredicateGroupId: ROOT_GROUP_ID,
          }),
        ],
      }),
    );

    expect(translationPlan.aborts).toContainEqual(
      expect.stringContaining(
        `Group ${SECOND_ROOT_GROUP_ID} of role ${MEMBER_ROLE_ID} on object ${PERSON_OBJECT_ID} has parent group ${ROOT_GROUP_ID} of role ${OTHER_ROLE_ID}`,
      ),
    );

    const deletedParentPlan = plan(
      buildSource({
        predicates: [
          buildPredicate({
            id: PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_CITY_FIELD_ID,
            operand: RowLevelPermissionPredicateOperand.IS_NOT_EMPTY,
            rowLevelPermissionPredicateGroupId: SECOND_ROOT_GROUP_ID,
          }),
        ],
        predicateGroups: [
          buildPredicateGroup({
            id: ROOT_GROUP_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            isDeleted: true,
          }),
          buildPredicateGroup({
            id: SECOND_ROOT_GROUP_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            parentRowLevelPermissionPredicateGroupId: ROOT_GROUP_ID,
          }),
        ],
      }),
    );

    expect(deletedParentPlan.aborts).toEqual([
      expect.stringContaining(
        `Group ${SECOND_ROOT_GROUP_ID} of role ${MEMBER_ROLE_ID} on object ${PERSON_OBJECT_ID} has deleted parent group ${ROOT_GROUP_ID}`,
      ),
    ]);
    expectNoWrites(deletedParentPlan);
  });

  it('aborts a "me" predicate through a linked record whose operand is not IS', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPolicyAgentIsMePredicate({
            operand: RowLevelPermissionPredicateOperand.IS_NOT,
          }),
        ],
      }),
    );

    expect(translationPlan.aborts).toEqual([
      expect.stringContaining(
        `Predicate ${PREDICATE_ID} of role ${MEMBER_ROLE_ID} on object ${POLICY_OBJECT_ID} cannot become a relation hop: it compares with the current workspace member through a linked record with operand IS_NOT`,
      ),
    ]);
    expectNoWrites(translationPlan);
  });

  it('hops through the relation named workspaceMember when the linked object also has a manager relation', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [buildPolicyAgentIsMePredicate()],
        fieldMetadatas: [
          ...BASE_FIELD_METADATAS,
          AGENT_PROFILE_MANAGER_FIELD_METADATA,
        ],
      }),
    );

    expect(translationPlan.aborts).toEqual([]);
    expect(translationPlan.predicateUpdates).toEqual([
      expect.objectContaining({
        relationFieldMetadataId: POLICY_AGENT_FIELD_ID,
        fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
        isConvertedToRelationHop: true,
      }),
    ]);
  });

  it('aborts when the linked object has several relations to workspaceMember and none is named workspaceMember', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [buildPolicyAgentIsMePredicate()],
        fieldMetadatas: [
          ...BASE_FIELD_METADATAS.map((fieldMetadata) =>
            fieldMetadata.id === AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID
              ? { ...fieldMetadata, name: 'owner' }
              : fieldMetadata,
          ),
          AGENT_PROFILE_MANAGER_FIELD_METADATA,
        ],
      }),
    );

    expect(translationPlan.aborts).toEqual([
      expect.stringContaining(
        `object ${AGENT_PROFILE_OBJECT_ID} has 2 many-to-one relations to workspaceMember (${AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID}, ${AGENT_PROFILE_MANAGER_FIELD_ID}) and none is named workspaceMember`,
      ),
    ]);
    expectNoWrites(translationPlan);
  });

  it('removes a write-only pair whose role may not write instead of planning a rule that grants nothing', () => {
    const source = buildSource({
      predicates: [
        buildPolicyAgentIsMePredicate({
          rowLevelPermissionPredicateGroupId: ROOT_GROUP_ID,
        }),
      ],
      predicateGroups: [
        buildPredicateGroup({
          id: ROOT_GROUP_ID,
          objectMetadataId: POLICY_OBJECT_ID,
          scope: 'WRITE',
        }),
      ],
    });
    const translationPlan = plan(source, false, READ_ONLY_ROLES_PERMISSIONS);

    expect(translationPlan.aborts).toEqual([]);
    expect(translationPlan.rowLevelPermissionRulesToInsert).toEqual([]);
    expect(translationPlan.predicateUpdates).toEqual([]);
    expect(translationPlan.predicateGroupUpdates).toEqual([]);
    expect(translationPlan.predicateIdsToSoftDelete).toEqual([PREDICATE_ID]);
    expect(translationPlan.predicateGroupIdsToSoftDelete).toEqual([
      ROOT_GROUP_ID,
    ]);
    expect(translationPlan.objectPermissionGrantsUpserts[0].grants).toEqual({
      canCreateObjectRecords: false,
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
    expect(translationPlan.shouldEnableRelationHop).toBe(false);
    expect(translationPlan.pairReports[0].outcome).toBe('removed');

    const rerunPlan = plan(
      applyPlanToSource(source, translationPlan),
      false,
      READ_ONLY_ROLES_PERMISSIONS,
    );

    expect(rerunPlan.aborts).toEqual([]);
    expect(rerunPlan.pairReports).toEqual([]);
    expectNoWrites(rerunPlan);
  });

  it('removes a dashboard audience predicate of a role that cannot reach any dashboard', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPredicate({
            id: PREDICATE_ID,
            objectMetadataId: DASHBOARD_OBJECT_ID,
            fieldMetadataId: DASHBOARD_AUDIENCE_FIELD_ID,
            operand: RowLevelPermissionPredicateOperand.CONTAINS,
            scope: 'READ',
          }),
        ],
      }),
      false,
      {},
    );

    expect(translationPlan.aborts).toEqual([]);
    expect(translationPlan.rowLevelPermissionRulesToInsert).toEqual([]);
    expect(translationPlan.predicateIdsToSoftDelete).toEqual([PREDICATE_ID]);
    expect(translationPlan.objectPermissionGrantsUpserts[0].grants).toEqual({
      canCreateObjectRecords: false,
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
  });

  it('aborts instead of removing a pair whose groups scope field permissions', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPolicyAgentIsMePredicate({
            rowLevelPermissionPredicateGroupId: ROOT_GROUP_ID,
          }),
        ],
        predicateGroups: [
          buildPredicateGroup({
            id: ROOT_GROUP_ID,
            objectMetadataId: POLICY_OBJECT_ID,
            scope: 'WRITE',
          }),
        ],
        fieldPermissions: [
          {
            id: FIELD_PERMISSION_ID,
            roleId: MEMBER_ROLE_ID,
            objectMetadataId: POLICY_OBJECT_ID,
            rowLevelPermissionPredicateGroupId: ROOT_GROUP_ID,
            rowLevelPermissionRuleId: null,
          },
        ],
      }),
      false,
      READ_ONLY_ROLES_PERMISSIONS,
    );

    expect(translationPlan.aborts).toEqual([
      expect.stringContaining(
        `field permission(s) ${FIELD_PERMISSION_ID} are scoped to its groups`,
      ),
    ]);
    expectNoWrites(translationPlan);
  });

  it('aborts an operand the field type does not allow', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPredicate({
            id: PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_CITY_FIELD_ID,
            operand: RowLevelPermissionPredicateOperand.GREATER_THAN_OR_EQUAL,
          }),
        ],
      }),
    );

    expect(translationPlan.aborts).toEqual([
      expect.stringContaining(
        `operand GREATER_THAN_OR_EQUAL is not allowed on field ${PERSON_CITY_FIELD_ID} of type TEXT`,
      ),
    ]);
  });

  it('aborts while a feature flag that widens record access is on', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [buildPolicyAgentIsMePredicate()],
        featureFlags: {
          [FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED]: true,
          [FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED]: false,
        },
      }),
    );

    expect(translationPlan.aborts).toEqual([
      expect.stringContaining(
        `Feature flag(s) ${FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED} are on`,
      ),
    ]);
  });

  it('aborts root trees owned by different applications instead of picking an owner', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPredicate({
            id: PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_CITY_FIELD_ID,
            operand: RowLevelPermissionPredicateOperand.IS_NOT_EMPTY,
          }),
          buildPredicate({
            id: SECOND_PREDICATE_ID,
            objectMetadataId: PERSON_OBJECT_ID,
            fieldMetadataId: PERSON_CITY_FIELD_ID,
            operand: RowLevelPermissionPredicateOperand.IS_EMPTY,
            applicationId: OTHER_APPLICATION_ID,
          }),
        ],
      }),
    );

    expect(translationPlan.aborts).toEqual([
      expect.stringContaining(
        `has 2 root trees owned by applications ${CUSTOM_APPLICATION_ID}, ${OTHER_APPLICATION_ID}`,
      ),
    ]);
  });

  it('plans nothing on a re-run', () => {
    const source = buildSource({
      predicates: [
        buildPolicyAgentIsMePredicate(),
        buildPredicate({
          id: SECOND_PREDICATE_ID,
          objectMetadataId: PERSON_OBJECT_ID,
          fieldMetadataId: PERSON_CITY_FIELD_ID,
          operand: RowLevelPermissionPredicateOperand.IS_NOT_EMPTY,
        }),
        buildPredicate({
          id: THIRD_PREDICATE_ID,
          objectMetadataId: PERSON_OBJECT_ID,
          fieldMetadataId: PERSON_CITY_FIELD_ID,
          operand: RowLevelPermissionPredicateOperand.IS_EMPTY,
          rowLevelPermissionPredicateGroupId: ROOT_GROUP_ID,
        }),
      ],
      predicateGroups: [
        buildPredicateGroup({
          id: ROOT_GROUP_ID,
          objectMetadataId: PERSON_OBJECT_ID,
        }),
      ],
    });
    const firstPlan = plan(source);

    expect(firstPlan.aborts).toEqual([]);
    expect(firstPlan.rootPredicateGroupsToInsert).toHaveLength(1);

    const rerunPlan = plan(applyPlanToSource(source, firstPlan));

    expect(rerunPlan.aborts).toEqual([]);
    expectNoWrites(rerunPlan);
    expect(rerunPlan.rootPredicateGroupsToInsert).toEqual([]);
    expect(rerunPlan.predicateGroupUpdates).toEqual([]);
    expect(rerunPlan.shouldEnableRelationHop).toBe(false);
    expect(rerunPlan.pairReports.map(({ outcome }) => outcome)).toEqual([
      'skipped',
      'skipped',
    ]);
  });

  it('aborts a pair whose rows are only partly linked to a rule', () => {
    const translationPlan = plan(
      buildSource({
        predicates: [
          buildPolicyAgentIsMePredicate({
            rowLevelPermissionRuleId: '20202020-8000-4000-8000-000000000001',
          }),
          buildPolicyAgentIsMePredicate({ id: SECOND_PREDICATE_ID }),
        ],
      }),
    );

    expect(translationPlan.aborts).toEqual([
      expect.stringContaining(`rows without a rule (${SECOND_PREDICATE_ID})`),
    ]);
  });
});
