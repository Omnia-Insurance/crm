import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  type FieldMetadataComplexOption,
  FieldMetadataType,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { EMPTY_ORCHESTRATOR_FAILURE_REPORT } from 'src/engine/workspace-manager/workspace-migration/constant/empty-orchestrator-failure-report.constant';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';
import { computeRoleRecordsPermissions } from 'src/engine/permissions/role/utils/compute-role-records-permissions.util';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';
import { type AllFlatEntityOperationByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-to-create-delete-update.type';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';
import { getDashboardAudiencePredicateIds } from 'src/modules/dashboard/dashboard-audience/utils/get-dashboard-audience-predicate-ids.util';

const NOW = '2026-11-01T00:00:00.000Z';

export const DASHBOARD_AUDIENCE_TEST_IDS = {
  workspace: 'dashboard-audience-workspace-id',
  customApplication: 'custom-application-id',
  // Deterministic identifiers use the application's universal identifier as a uuid namespace
  customApplicationUniversalIdentifier: '00000000-0000-4000-8000-0000000000a1',
  brokerageApplication: 'brokerage-application-id',
  brokerageApplicationUniversalIdentifier:
    '00000000-0000-4000-8000-0000000000a2',
  dashboardObject: 'dashboard-object-id',
  audienceField: 'audience-field-id',
  adminRole: '00000000-0000-4000-8000-00000000000a',
  memberRole: '00000000-0000-4000-8000-00000000000b',
  agentRole: '00000000-0000-4000-8000-00000000000c',
  suspendedRole: '00000000-0000-4000-8000-00000000000d',
  grantRole: '00000000-0000-4000-8000-00000000000e',
} as const;

const APPLICATION_ID_BY_UNIVERSAL_IDENTIFIER: Record<string, string> = {
  [DASHBOARD_AUDIENCE_TEST_IDS.customApplicationUniversalIdentifier]:
    DASHBOARD_AUDIENCE_TEST_IDS.customApplication,
  [DASHBOARD_AUDIENCE_TEST_IDS.brokerageApplicationUniversalIdentifier]:
    DASHBOARD_AUDIENCE_TEST_IDS.brokerageApplication,
};

export const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
): FlatEntityMaps<TFlatEntity> =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

export const DASHBOARD_FLAT_OBJECT_METADATA_MOCK = getFlatObjectMetadataMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
  universalIdentifier: STANDARD_OBJECTS.dashboard.universalIdentifier,
  nameSingular: 'dashboard',
  namePlural: 'dashboards',
});

export const buildAudienceOptionMock = ({
  roleId,
  label,
  position,
}: {
  roleId: string;
  label: string;
  position: number;
}): FieldMetadataComplexOption => ({
  id: `option-${roleId}`,
  value: encodeDashboardAudienceRoleToken(roleId),
  label,
  position,
  color: 'gray',
});

export const buildAudienceFieldMock = (
  options: FieldMetadataComplexOption[],
): FlatFieldMetadata =>
  getFlatFieldMetadataMock({
    id: DASHBOARD_AUDIENCE_TEST_IDS.audienceField,
    universalIdentifier: 'audience-field-universal-identifier',
    objectMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
    objectMetadataUniversalIdentifier:
      STANDARD_OBJECTS.dashboard.universalIdentifier,
    type: FieldMetadataType.MULTI_SELECT,
    name: 'audience',
    label: 'Audience',
    options,
  });

export const buildFlatRoleMock = (
  overrides: Pick<FlatRole, 'id' | 'label'> & Partial<FlatRole>,
): FlatRole => ({
  universalIdentifier: `${overrides.id}-universal-identifier`,
  description: null,
  icon: null,
  isEditable: true,
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canAccessAllAgentChatChannels: false,
  canReadAllObjectRecords: true,
  canCreateAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  showAllObjectsInSidebar: true,
  editWindowMinutes: null,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  canBeAssignedToApplications: false,
  workspaceId: DASHBOARD_AUDIENCE_TEST_IDS.workspace,
  createdAt: NOW,
  updatedAt: NOW,
  applicationId: DASHBOARD_AUDIENCE_TEST_IDS.customApplication,
  applicationUniversalIdentifier:
    DASHBOARD_AUDIENCE_TEST_IDS.customApplicationUniversalIdentifier,
  roleTargetIds: [],
  roleTargetUniversalIdentifiers: [],
  objectPermissionIds: [],
  rolePermissionFlagIds: [],
  objectPermissionUniversalIdentifiers: [],
  rolePermissionFlagUniversalIdentifiers: [],
  fieldPermissionIds: [],
  rowLevelPermissionRuleIds: [],
  fieldPermissionUniversalIdentifiers: [],
  rowLevelPermissionRuleUniversalIdentifiers: [],
  rowLevelPermissionPredicateIds: [],
  rowLevelPermissionPredicateUniversalIdentifiers: [],
  rowLevelPermissionPredicateGroupIds: [],
  rowLevelPermissionPredicateGroupUniversalIdentifiers: [],
  agentChatChannelRoleIds: [],
  agentChatChannelRoleUniversalIdentifiers: [],
  ...overrides,
});

type ObjectPermissionGrantsMock = Pick<
  FlatObjectPermission,
  | 'canCreateObjectRecords'
  | 'canReadObjectRecords'
  | 'canUpdateObjectRecords'
  | 'canSoftDeleteObjectRecords'
  | 'canDestroyObjectRecords'
>;

export const DENY_ALL_OBJECT_PERMISSION_GRANTS: ObjectPermissionGrantsMock = {
  canCreateObjectRecords: false,
  canReadObjectRecords: false,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
};

export const buildObjectPermissionMock = ({
  flatRole,
  flatObjectMetadata = DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
  grants,
  showInSidebar = null,
}: {
  flatRole: FlatRole;
  flatObjectMetadata?: FlatObjectMetadata;
  grants: Partial<ObjectPermissionGrantsMock>;
  showInSidebar?: boolean | null;
}): FlatObjectPermission => ({
  id: `${flatRole.id}-${flatObjectMetadata.id}-permission-id`,
  universalIdentifier: `${flatRole.id}-${flatObjectMetadata.id}-permission-universal-identifier`,
  applicationId: flatRole.applicationId,
  applicationUniversalIdentifier: flatRole.applicationUniversalIdentifier,
  workspaceId: DASHBOARD_AUDIENCE_TEST_IDS.workspace,
  roleId: flatRole.id,
  roleUniversalIdentifier: flatRole.universalIdentifier,
  objectMetadataId: flatObjectMetadata.id,
  objectMetadataUniversalIdentifier: flatObjectMetadata.universalIdentifier,
  canCreateObjectRecords: null,
  canReadObjectRecords: null,
  canUpdateObjectRecords: null,
  canSoftDeleteObjectRecords: null,
  canDestroyObjectRecords: null,
  ...grants,
  showInSidebar,
  editWindowMinutes: null,
  createdAt: NOW,
  updatedAt: NOW,
});

export const buildRuleMock = ({
  flatRole,
  flatObjectMetadata = DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
  id = `${flatRole.id}-${flatObjectMetadata.id}-rule-id`,
  grants,
}: {
  flatRole: FlatRole;
  flatObjectMetadata?: FlatObjectMetadata;
  id?: string;
  grants: Partial<
    Pick<
      FlatRowLevelPermissionRule,
      | 'canCreateRecords'
      | 'canReadRecords'
      | 'canUpdateRecords'
      | 'canSoftDeleteRecords'
      | 'canDestroyRecords'
    >
  >;
}): FlatRowLevelPermissionRule => ({
  id,
  universalIdentifier: `${id}-universal-identifier`,
  applicationId: DASHBOARD_AUDIENCE_TEST_IDS.customApplication,
  applicationUniversalIdentifier:
    DASHBOARD_AUDIENCE_TEST_IDS.customApplicationUniversalIdentifier,
  workspaceId: DASHBOARD_AUDIENCE_TEST_IDS.workspace,
  roleId: flatRole.id,
  roleUniversalIdentifier: flatRole.universalIdentifier,
  objectMetadataId: flatObjectMetadata.id,
  objectMetadataUniversalIdentifier: flatObjectMetadata.universalIdentifier,
  canCreateRecords: false,
  canReadRecords: false,
  canUpdateRecords: false,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
  ...grants,
  createdAt: NOW,
  updatedAt: NOW,
});

// The audience predicate as rules first wrote it: the legacy id, linked to the role's rule
export const buildAudiencePredicateMock = ({
  flatRole,
  rule,
  deletedAt = null,
  value = JSON.stringify([encodeDashboardAudienceRoleToken(flatRole.id)]),
}: {
  flatRole: FlatRole;
  rule: FlatRowLevelPermissionRule | null;
  deletedAt?: string | null;
  value?: string;
}): FlatRowLevelPermissionPredicate => {
  const [legacyPredicateId] = getDashboardAudiencePredicateIds({
    roleId: flatRole.id,
    dashboardObjectMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
  });

  return {
    id: legacyPredicateId,
    universalIdentifier: legacyPredicateId,
    applicationId: DASHBOARD_AUDIENCE_TEST_IDS.customApplication,
    applicationUniversalIdentifier:
      DASHBOARD_AUDIENCE_TEST_IDS.customApplicationUniversalIdentifier,
    workspaceId: DASHBOARD_AUDIENCE_TEST_IDS.workspace,
    roleId: flatRole.id,
    roleUniversalIdentifier: flatRole.universalIdentifier,
    objectMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
    objectMetadataUniversalIdentifier:
      STANDARD_OBJECTS.dashboard.universalIdentifier,
    fieldMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.audienceField,
    fieldMetadataUniversalIdentifier: 'audience-field-universal-identifier',
    relationFieldMetadataId: null,
    relationFieldMetadataUniversalIdentifier: null,
    operand: RowLevelPermissionPredicateOperand.CONTAINS,
    value,
    subFieldName: null,
    workspaceMemberFieldMetadataId: null,
    workspaceMemberFieldMetadataUniversalIdentifier: null,
    workspaceMemberSubFieldName: null,
    rowLevelPermissionPredicateGroupId: null,
    rowLevelPermissionPredicateGroupUniversalIdentifier: null,
    rowLevelPermissionRuleId: rule?.id ?? null,
    rowLevelPermissionRuleUniversalIdentifier:
      rule?.universalIdentifier ?? null,
    positionInRowLevelPermissionPredicateGroup: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt,
  };
};

export type DashboardAudienceWorkspaceState = {
  roles: FlatRole[];
  objectMetadatas: FlatObjectMetadata[];
  fieldMetadatas: FlatFieldMetadata[];
  objectPermissions: FlatObjectPermission[];
  rules: FlatRowLevelPermissionRule[];
  predicates: FlatRowLevelPermissionPredicate[];
  predicateGroups: FlatRowLevelPermissionPredicateGroup[];
  userWorkspaceRoleMap: Record<string, string>;
  featureFlagsMap: Record<string, boolean>;
};

export type MigrationCallMock = {
  allFlatEntityOperationByMetadataName: AllFlatEntityOperationByMetadataName;
  workspaceId: string;
  isSystemBuild?: boolean;
  applicationUniversalIdentifier: string;
};

const replaceByUniversalIdentifier = <
  TFlatEntity extends { universalIdentifier: string },
>({
  rows,
  updates,
  deletes,
  creates,
}: {
  rows: TFlatEntity[];
  updates: Partial<TFlatEntity>[];
  deletes: { universalIdentifier: string }[];
  creates: TFlatEntity[];
}): TFlatEntity[] => {
  const deletedUniversalIdentifiers = new Set(
    deletes.map(({ universalIdentifier }) => universalIdentifier),
  );
  const updateByUniversalIdentifier = new Map(
    updates.map((update) => [update.universalIdentifier, update]),
  );

  return [
    ...rows
      .filter(
        ({ universalIdentifier }) =>
          !deletedUniversalIdentifiers.has(universalIdentifier),
      )
      .map((row) => ({
        ...row,
        ...updateByUniversalIdentifier.get(row.universalIdentifier),
      })),
    ...creates,
  ];
};

export const computeRolesPermissionsMock = (
  state: DashboardAudienceWorkspaceState,
): Record<string, RoleRecordsPermissions> =>
  Object.fromEntries(
    state.roles.map((flatRole) => [
      flatRole.id,
      computeRoleRecordsPermissions({
        roleDefinition: {
          ...flatRole,
          isPermissionFlagGranted: () => false,
          objectPermissions: state.objectPermissions.filter(
            ({ roleId }) => roleId === flatRole.id,
          ),
          fieldPermissions: [],
          rowLevelPermissionRules: state.rules.filter(
            ({ roleId }) => roleId === flatRole.id,
          ),
          rowLevelPermissionPredicates: state.predicates.filter(
            ({ roleId, deletedAt }) =>
              roleId === flatRole.id && !isDefined(deletedAt),
          ),
          rowLevelPermissionPredicateGroups: [],
        },
        objectMetadataCollection: state.objectMetadatas,
        resolveMorphRelationPermissionFieldIds: (fieldMetadataId) => [
          fieldMetadataId,
        ],
      }),
    ]),
  );

// In-memory workspace behind the cache, migration and field services, so the real row level
// permission service can build rules exactly as it does against the database
export const createDashboardAudienceWorkspaceFake = (
  initialState: Partial<DashboardAudienceWorkspaceState> = {},
) => {
  const state: DashboardAudienceWorkspaceState = {
    roles: [],
    objectMetadatas: [DASHBOARD_FLAT_OBJECT_METADATA_MOCK],
    fieldMetadatas: [],
    objectPermissions: [],
    rules: [],
    predicates: [],
    predicateGroups: [],
    userWorkspaceRoleMap: {},
    featureFlagsMap: {},
    ...initialState,
  };

  const buildCacheEntries = () => ({
    flatRoleMaps: buildFlatEntityMaps(state.roles),
    roleIdsWithAllRecordsAccess: state.roles
      .filter(({ canUpdateAllSettings }) => canUpdateAllSettings)
      .map(({ id }) => id),
    flatObjectMetadataMaps: buildFlatEntityMaps(state.objectMetadatas),
    flatFieldMetadataMaps: buildFlatEntityMaps(state.fieldMetadatas),
    flatFieldMetadataMapsOrm: buildFlatEntityMaps(state.fieldMetadatas),
    flatIndexMaps: createEmptyFlatEntityMaps(),
    flatObjectPermissionMaps: buildFlatEntityMaps(state.objectPermissions),
    flatFieldPermissionMaps: createEmptyFlatEntityMaps(),
    flatRowLevelPermissionRuleMaps: buildFlatEntityMaps(state.rules),
    flatRowLevelPermissionPredicateMaps: buildFlatEntityMaps(state.predicates),
    flatRowLevelPermissionPredicateGroupMaps: buildFlatEntityMaps(
      state.predicateGroups,
    ),
    userWorkspaceRoleMap: state.userWorkspaceRoleMap,
    rolesPermissions: computeRolesPermissionsMock(state),
    featureFlagsMap: state.featureFlagsMap,
  });

  const getCacheEntries = async (cacheKeyNames: string[]) => {
    const cacheEntries: Record<string, unknown> = buildCacheEntries();

    return Object.fromEntries(
      cacheKeyNames.map((cacheKeyName) => [
        cacheKeyName,
        cacheEntries[cacheKeyName],
      ]),
    );
  };

  const findFlatRoleByUniversalIdentifier = (universalIdentifier: string) =>
    state.roles.find(
      (flatRole) => flatRole.universalIdentifier === universalIdentifier,
    );

  const workspaceMigrationValidateBuildAndRunService = {
    validateBuildAndRunWorkspaceMigration: jest.fn(
      async ({
        allFlatEntityOperationByMetadataName,
        isSystemBuild = false,
        applicationUniversalIdentifier,
      }: MigrationCallMock) => {
        const {
          objectPermission,
          rowLevelPermissionRule,
          rowLevelPermissionPredicate,
          rowLevelPermissionPredicateGroup,
        } = allFlatEntityOperationByMetadataName;

        // Mirrors validateRoleBelongsToCallerApplication and getRoleNotEditableErrors
        const isObjectPermissionRejected = [
          ...(objectPermission?.flatEntityToCreate ?? []),
          ...(objectPermission?.flatEntityToUpdate ?? []),
        ].some(({ roleUniversalIdentifier }) => {
          const flatRole = findFlatRoleByUniversalIdentifier(
            roleUniversalIdentifier,
          );

          return (
            !isDefined(flatRole) ||
            flatRole.applicationUniversalIdentifier !==
              applicationUniversalIdentifier ||
            (!isSystemBuild && !flatRole.isEditable)
          );
        });
        const isPredicateRejected = [
          ...(rowLevelPermissionPredicate?.flatEntityToCreate ?? []),
          ...(rowLevelPermissionPredicate?.flatEntityToUpdate ?? []),
        ].some(({ roleUniversalIdentifier }) => {
          const flatRole = findFlatRoleByUniversalIdentifier(
            roleUniversalIdentifier,
          );

          return (
            !isDefined(flatRole) || (!isSystemBuild && !flatRole.isEditable)
          );
        });

        if (isObjectPermissionRejected || isPredicateRejected) {
          return {
            status: 'fail' as const,
            report: EMPTY_ORCHESTRATOR_FAILURE_REPORT(),
          };
        }

        state.objectPermissions = replaceByUniversalIdentifier({
          rows: state.objectPermissions,
          updates: (objectPermission?.flatEntityToUpdate ??
            []) as Partial<FlatObjectPermission>[],
          deletes: objectPermission?.flatEntityToDelete ?? [],
          creates: (objectPermission?.flatEntityToCreate ?? []).map(
            (universalFlatObjectPermission) =>
              ({
                ...universalFlatObjectPermission,
                applicationId:
                  APPLICATION_ID_BY_UNIVERSAL_IDENTIFIER[
                    universalFlatObjectPermission.applicationUniversalIdentifier
                  ],
                workspaceId: DASHBOARD_AUDIENCE_TEST_IDS.workspace,
                roleId: findFlatRoleByUniversalIdentifier(
                  universalFlatObjectPermission.roleUniversalIdentifier,
                )?.id,
                objectMetadataId: state.objectMetadatas.find(
                  ({ universalIdentifier }) =>
                    universalIdentifier ===
                    universalFlatObjectPermission.objectMetadataUniversalIdentifier,
                )?.id,
              }) as FlatObjectPermission,
          ),
        });
        state.rules = replaceByUniversalIdentifier({
          rows: state.rules,
          updates: (rowLevelPermissionRule?.flatEntityToUpdate ??
            []) as Partial<FlatRowLevelPermissionRule>[],
          deletes: rowLevelPermissionRule?.flatEntityToDelete ?? [],
          creates: (rowLevelPermissionRule?.flatEntityToCreate ??
            []) as FlatRowLevelPermissionRule[],
        });
        state.predicates = replaceByUniversalIdentifier({
          rows: state.predicates,
          updates: (rowLevelPermissionPredicate?.flatEntityToUpdate ??
            []) as Partial<FlatRowLevelPermissionPredicate>[],
          deletes: rowLevelPermissionPredicate?.flatEntityToDelete ?? [],
          creates: (rowLevelPermissionPredicate?.flatEntityToCreate ??
            []) as FlatRowLevelPermissionPredicate[],
        });
        state.predicateGroups = replaceByUniversalIdentifier({
          rows: state.predicateGroups,
          updates: (rowLevelPermissionPredicateGroup?.flatEntityToUpdate ??
            []) as Partial<FlatRowLevelPermissionPredicateGroup>[],
          deletes: rowLevelPermissionPredicateGroup?.flatEntityToDelete ?? [],
          creates: (rowLevelPermissionPredicateGroup?.flatEntityToCreate ??
            []) as FlatRowLevelPermissionPredicateGroup[],
        });

        return { status: 'success' as const };
      },
    ),
  };

  const fieldMetadataService = {
    createOneField: jest.fn(
      async ({
        createFieldInput,
      }: {
        createFieldInput: {
          objectMetadataId: string;
          name: string;
          options?: FieldMetadataComplexOption[];
        };
      }) => {
        const createdField = getFlatFieldMetadataMock({
          id: DASHBOARD_AUDIENCE_TEST_IDS.audienceField,
          universalIdentifier: 'audience-field-universal-identifier',
          objectMetadataId: createFieldInput.objectMetadataId,
          type: FieldMetadataType.MULTI_SELECT,
          name: createFieldInput.name,
          options: (createFieldInput.options ?? []).map((option) => ({
            ...option,
            id: `option-${option.value}`,
          })),
        });

        state.fieldMetadatas = [...state.fieldMetadatas, createdField];

        return createdField;
      },
    ),
    updateOneField: jest.fn(
      async ({
        updateFieldInput,
      }: {
        updateFieldInput: {
          id: string;
          options?: FieldMetadataComplexOption[];
        };
      }) => {
        state.fieldMetadatas = state.fieldMetadatas.map((flatFieldMetadata) =>
          flatFieldMetadata.id === updateFieldInput.id
            ? {
                ...flatFieldMetadata,
                options: (updateFieldInput.options ?? []).map((option) => ({
                  ...option,
                  id: option.id ?? `option-${option.value}`,
                })),
              }
            : flatFieldMetadata,
        );
      },
    ),
  };

  return {
    state,
    workspaceCacheService: {
      getOrRecompute: jest.fn(
        async (_workspaceId: string, cacheKeyNames: string[]) =>
          getCacheEntries(cacheKeyNames),
      ),
      invalidateAndRecompute: jest.fn(async () => undefined),
    },
    workspaceManyOrAllFlatEntityMapsCacheService: {
      getOrRecomputeManyOrAllFlatEntityMaps: jest.fn(
        async ({ flatMapsKeys }: { flatMapsKeys: string[] }) =>
          getCacheEntries(flatMapsKeys),
      ),
    },
    workspaceMigrationValidateBuildAndRunService,
    fieldMetadataService,
    applicationService: {
      findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest.fn(
        async () => ({
          workspaceCustomFlatApplication: {
            id: DASHBOARD_AUDIENCE_TEST_IDS.customApplication,
            universalIdentifier:
              DASHBOARD_AUDIENCE_TEST_IDS.customApplicationUniversalIdentifier,
          },
        }),
      ),
    },
    billingService: { hasEntitlement: jest.fn(async () => true) },
    enterprisePlanService: { isValid: jest.fn(() => true) },
    getMigrationCalls: (): MigrationCallMock[] =>
      workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration.mock.calls.map(
        ([call]) => call,
      ),
  };
};
