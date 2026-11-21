import { isDefined } from 'twenty-shared/utils';
import { v4, v5 } from 'uuid';

import { type ApplicationGrantRoleService } from 'src/engine/core-modules/application/application-grant-role/services/application-grant-role.service';
import { type FlatApplicationCacheMaps } from 'src/engine/core-modules/application/types/flat-application-cache-maps.type';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { type CacheLockService } from 'src/engine/core-modules/cache-lock/cache-lock.service';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type AllFlatEntityOperationByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-to-create-delete-update.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { type FlatFieldPermission } from 'src/engine/metadata-modules/flat-field-permission/types/flat-field-permission.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRoleTarget } from 'src/engine/metadata-modules/flat-role-target/types/flat-role-target.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';
import { computeRoleRecordsPermissions } from 'src/engine/permissions/role/utils/compute-role-records-permissions.util';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type MetadataEventBatch } from 'src/engine/subscriptions/metadata-event/types/metadata-event-batch.type';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { type WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { type MetadataEvent } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/types/metadata-event.type';
import { ReconciliationObjectLockdownService } from 'src/modules/reconciliation/services/object-lockdown.service';

// An in-memory workspace standing in for the cache, the migration runner and the grant role re-sync

export const LOCKDOWN_WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';

const NOW = '2026-11-01T00:00:00.000Z';

export const getLockdownFlatObjectMetadataMock = ({
  id,
  nameSingular,
  flatApplication,
}: {
  id: string;
  nameSingular: string;
  flatApplication: Pick<FlatApplication, 'id' | 'universalIdentifier'>;
}): FlatObjectMetadata =>
  getFlatObjectMetadataMock({
    id,
    universalIdentifier: id,
    nameSingular,
    namePlural: `${nameSingular}s`,
    applicationId: flatApplication.id,
    applicationUniversalIdentifier: flatApplication.universalIdentifier,
    workspaceId: LOCKDOWN_WORKSPACE_ID,
  });

export type LockdownWorkspaceState = {
  applications: FlatApplication[];
  roles: FlatRole[];
  grantRoleIdByApplicationId: Record<string, string>;
  objectMetadatas: FlatObjectMetadata[];
  objectPermissions: FlatObjectPermission[];
  fieldPermissions: FlatFieldPermission[];
  rules: FlatRowLevelPermissionRule[];
  predicates: FlatRowLevelPermissionPredicate[];
  predicateGroups: FlatRowLevelPermissionPredicateGroup[];
};

type LockdownMigrationArgs = {
  allFlatEntityOperationByMetadataName: AllFlatEntityOperationByMetadataName;
  workspaceId: string;
  isSystemBuild?: boolean;
  applicationUniversalIdentifier: string;
};

type LockdownMigrationResult = { status: 'success' } | { status: 'fail' };

export const buildLockdownFlatApplicationMock = (
  overrides: Pick<FlatApplication, 'id' | 'universalIdentifier' | 'name'> &
    Partial<FlatApplication>,
): FlatApplication =>
  ({
    defaultRoleId: null,
    deletedAt: null,
    workspaceId: LOCKDOWN_WORKSPACE_ID,
    ...overrides,
  }) as FlatApplication;

export const buildLockdownFlatRoleMock = (
  overrides: Pick<FlatRole, 'id' | 'universalIdentifier' | 'label'> & {
    flatApplication: Pick<FlatApplication, 'id' | 'universalIdentifier'>;
  } & Partial<FlatRole>,
): FlatRole => {
  const { flatApplication, ...roleOverrides } = overrides;

  return {
    description: null,
    icon: null,
    isEditable: true,
    canUpdateAllSettings: false,
    canAccessAllTools: false,
    canAccessAllAgentChatChannels: false,
    canReadAllObjectRecords: true,
    canCreateAllObjectRecords: true,
    canUpdateAllObjectRecords: true,
    canSoftDeleteAllObjectRecords: true,
    canDestroyAllObjectRecords: true,
    showAllObjectsInSidebar: true,
    editWindowMinutes: null,
    canBeAssignedToUsers: true,
    canBeAssignedToAgents: true,
    canBeAssignedToApiKeys: true,
    canBeAssignedToApplications: false,
    workspaceId: LOCKDOWN_WORKSPACE_ID,
    createdAt: NOW,
    updatedAt: NOW,
    applicationId: flatApplication.id,
    applicationUniversalIdentifier: flatApplication.universalIdentifier,
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
    ...roleOverrides,
  };
};

type RoleAndObjectReference = {
  flatRole: Pick<
    FlatRole,
    | 'id'
    | 'universalIdentifier'
    | 'applicationId'
    | 'applicationUniversalIdentifier'
  >;
  flatObjectMetadata: Pick<FlatObjectMetadata, 'id' | 'universalIdentifier'>;
};

const toRoleAndObjectProperties = ({
  flatRole,
  flatObjectMetadata,
}: RoleAndObjectReference) => ({
  applicationId: flatRole.applicationId,
  applicationUniversalIdentifier: flatRole.applicationUniversalIdentifier,
  workspaceId: LOCKDOWN_WORKSPACE_ID,
  roleId: flatRole.id,
  roleUniversalIdentifier: flatRole.universalIdentifier,
  objectMetadataId: flatObjectMetadata.id,
  objectMetadataUniversalIdentifier: flatObjectMetadata.universalIdentifier,
  createdAt: NOW,
  updatedAt: NOW,
});

export const buildLockdownFlatObjectPermissionMock = ({
  flatRole,
  flatObjectMetadata,
  ...overrides
}: RoleAndObjectReference &
  Partial<FlatObjectPermission>): FlatObjectPermission => ({
  id: v4(),
  universalIdentifier: v4(),
  ...toRoleAndObjectProperties({ flatRole, flatObjectMetadata }),
  canCreateObjectRecords: null,
  canReadObjectRecords: null,
  canUpdateObjectRecords: null,
  canSoftDeleteObjectRecords: null,
  canDestroyObjectRecords: null,
  showInSidebar: null,
  editWindowMinutes: null,
  ...overrides,
});

export const buildLockdownFlatRuleMock = ({
  flatRole,
  flatObjectMetadata,
  ...overrides
}: RoleAndObjectReference &
  Partial<FlatRowLevelPermissionRule>): FlatRowLevelPermissionRule => ({
  id: v4(),
  universalIdentifier: v4(),
  ...toRoleAndObjectProperties({ flatRole, flatObjectMetadata }),
  canCreateRecords: false,
  canReadRecords: false,
  canUpdateRecords: false,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
  ...overrides,
});

export const buildLockdownFlatPredicateGroupMock = ({
  flatRole,
  flatObjectMetadata,
  ...overrides
}: RoleAndObjectReference &
  Partial<FlatRowLevelPermissionPredicateGroup>): FlatRowLevelPermissionPredicateGroup =>
  ({
    id: v4(),
    universalIdentifier: v4(),
    ...toRoleAndObjectProperties({ flatRole, flatObjectMetadata }),
    parentRowLevelPermissionPredicateGroupId: null,
    rowLevelPermissionRuleId: null,
    deletedAt: null,
    ...overrides,
  }) as FlatRowLevelPermissionPredicateGroup;

export const buildLockdownFlatPredicateMock = ({
  flatRole,
  flatObjectMetadata,
  ...overrides
}: RoleAndObjectReference &
  Partial<FlatRowLevelPermissionPredicate>): FlatRowLevelPermissionPredicate =>
  ({
    id: v4(),
    universalIdentifier: v4(),
    ...toRoleAndObjectProperties({ flatRole, flatObjectMetadata }),
    fieldMetadataId: v4(),
    relationFieldMetadataId: null,
    workspaceMemberFieldMetadataId: null,
    workspaceMemberSubFieldName: null,
    subFieldName: null,
    value: null,
    rowLevelPermissionPredicateGroupId: null,
    rowLevelPermissionRuleId: null,
    positionInRowLevelPermissionPredicateGroup: null,
    deletedAt: null,
    ...overrides,
  }) as FlatRowLevelPermissionPredicate;

export const buildLockdownFlatFieldPermissionMock = ({
  flatRole,
  flatObjectMetadata,
  ...overrides
}: RoleAndObjectReference &
  Partial<FlatFieldPermission>): FlatFieldPermission =>
  ({
    id: v4(),
    universalIdentifier: v4(),
    ...toRoleAndObjectProperties({ flatRole, flatObjectMetadata }),
    fieldMetadataId: v4(),
    rowLevelPermissionPredicateGroupId: null,
    rowLevelPermissionRuleId: null,
    canReadFieldValue: false,
    canUpdateFieldValue: false,
    ...overrides,
  }) as FlatFieldPermission;

const toFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
): FlatEntityMaps<TFlatEntity> =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const toFlatApplicationMaps = (
  applications: FlatApplication[],
): FlatApplicationCacheMaps => ({
  byId: Object.fromEntries(
    applications.map((application) => [application.id, application]),
  ),
  idByUniversalIdentifier: Object.fromEntries(
    applications.map((application) => [
      application.universalIdentifier,
      application.id,
    ]),
  ),
});

const buildMetadataEventBatch = ({
  metadataName,
  type,
  events,
}: Pick<
  MetadataEventBatch,
  'metadataName' | 'type' | 'events'
>): MetadataEventBatch => ({
  name: `metadata.${metadataName}.${type}`,
  workspaceId: LOCKDOWN_WORKSPACE_ID,
  metadataName,
  type,
  events,
});

const removeByUniversalIdentifier = <
  TFlatEntity extends { universalIdentifier: string },
>(
  flatEntities: TFlatEntity[],
  flatEntitiesToRemove: { universalIdentifier: string }[],
): { kept: TFlatEntity[]; removed: TFlatEntity[] } => {
  const universalIdentifiersToRemove = new Set(
    flatEntitiesToRemove.map(({ universalIdentifier }) => universalIdentifier),
  );

  return {
    kept: flatEntities.filter(
      ({ universalIdentifier }) =>
        !universalIdentifiersToRemove.has(universalIdentifier),
    ),
    removed: flatEntities.filter(({ universalIdentifier }) =>
      universalIdentifiersToRemove.has(universalIdentifier),
    ),
  };
};

export const createLockdownWorkspaceMock = (
  initialState: LockdownWorkspaceState,
) => {
  const state: LockdownWorkspaceState = structuredClone(initialState);
  let emittedMetadataEventBatches: MetadataEventBatch[] = [];

  const emit = (
    batch: Pick<MetadataEventBatch, 'metadataName' | 'type' | 'events'>,
  ) => {
    if (batch.events.length > 0) {
      emittedMetadataEventBatches.push(buildMetadataEventBatch(batch));
    }
  };

  const findFlatRoleByUniversalIdentifier = (universalIdentifier: string) =>
    state.roles.find(
      (flatRole) => flatRole.universalIdentifier === universalIdentifier,
    );

  const getOrRecompute = async () => ({
    flatApplicationMaps: toFlatApplicationMaps(state.applications),
    flatRoleMaps: toFlatEntityMaps(state.roles),
    flatRoleTargetByApplicationIdMaps: Object.fromEntries(
      Object.entries(state.grantRoleIdByApplicationId).map(
        ([applicationId, roleId]) => [
          applicationId,
          { roleId, targetApplicationId: applicationId } as FlatRoleTarget,
        ],
      ),
    ),
    flatObjectMetadataMaps: toFlatEntityMaps(state.objectMetadatas),
    flatObjectPermissionMaps: toFlatEntityMaps(state.objectPermissions),
    flatFieldPermissionMaps: toFlatEntityMaps(state.fieldPermissions),
    flatRowLevelPermissionRuleMaps: toFlatEntityMaps(state.rules),
    flatRowLevelPermissionPredicateMaps: toFlatEntityMaps(state.predicates),
    flatRowLevelPermissionPredicateGroupMaps: toFlatEntityMaps(
      state.predicateGroups,
    ),
  });

  // Applies the operations the lockdown sends, with the ownership checks the real validators make
  const validateBuildAndRunWorkspaceMigration = async ({
    allFlatEntityOperationByMetadataName,
    isSystemBuild = false,
    applicationUniversalIdentifier,
  }: LockdownMigrationArgs): Promise<LockdownMigrationResult> => {
    const {
      objectPermission,
      rowLevelPermissionRule,
      rowLevelPermissionPredicateGroup,
      rowLevelPermissionPredicate,
      fieldPermission,
    } = allFlatEntityOperationByMetadataName;
    const buildFlatApplication = state.applications.find(
      ({ universalIdentifier }) =>
        universalIdentifier === applicationUniversalIdentifier,
    );
    const objectPermissionsToWrite = [
      ...(objectPermission?.flatEntityToCreate ?? []),
      ...(objectPermission?.flatEntityToUpdate ?? []),
    ];

    const isRejected = objectPermissionsToWrite.some(
      (universalFlatObjectPermission) => {
        const flatRole = findFlatRoleByUniversalIdentifier(
          universalFlatObjectPermission.roleUniversalIdentifier,
        );

        return (
          !isDefined(flatRole) ||
          flatRole.applicationUniversalIdentifier !==
            applicationUniversalIdentifier ||
          (!isSystemBuild && !flatRole.isEditable)
        );
      },
    );

    if (!isDefined(buildFlatApplication) || isRejected) {
      return { status: 'fail' };
    }

    const createdObjectPermissions = (
      objectPermission?.flatEntityToCreate ?? []
    ).map((universalFlatObjectPermission): FlatObjectPermission => {
      const flatRole = findFlatRoleByUniversalIdentifier(
        universalFlatObjectPermission.roleUniversalIdentifier,
      );
      const flatObjectMetadata = state.objectMetadatas.find(
        ({ universalIdentifier }) =>
          universalIdentifier ===
          universalFlatObjectPermission.objectMetadataUniversalIdentifier,
      );

      return {
        ...universalFlatObjectPermission,
        id: v4(),
        workspaceId: LOCKDOWN_WORKSPACE_ID,
        applicationId: buildFlatApplication.id,
        roleId: flatRole?.id ?? '',
        objectMetadataId: flatObjectMetadata?.id ?? '',
      };
    });

    const isDuplicate = createdObjectPermissions.some((created) =>
      state.objectPermissions.some(
        (existing) =>
          existing.universalIdentifier === created.universalIdentifier ||
          (existing.roleId === created.roleId &&
            existing.objectMetadataId === created.objectMetadataId),
      ),
    );

    if (isDuplicate) {
      return { status: 'fail' };
    }

    const updatedObjectPermissions = (
      objectPermission?.flatEntityToUpdate ?? []
    ).flatMap((universalFlatObjectPermission) => {
      const existing = state.objectPermissions.find(
        ({ universalIdentifier }) =>
          universalIdentifier ===
          universalFlatObjectPermission.universalIdentifier,
      );

      return isDefined(existing)
        ? [
            {
              before: existing,
              after: { ...existing, ...universalFlatObjectPermission },
            },
          ]
        : [];
    });

    state.objectPermissions = [
      ...state.objectPermissions.map(
        (existing) =>
          updatedObjectPermissions.find(
            ({ before }) =>
              before.universalIdentifier === existing.universalIdentifier,
          )?.after ?? existing,
      ),
      ...createdObjectPermissions,
    ];

    const fieldPermissions = removeByUniversalIdentifier(
      state.fieldPermissions,
      fieldPermission?.flatEntityToDelete ?? [],
    );
    const predicates = removeByUniversalIdentifier(
      state.predicates,
      rowLevelPermissionPredicate?.flatEntityToDelete ?? [],
    );
    const predicateGroups = removeByUniversalIdentifier(
      state.predicateGroups,
      rowLevelPermissionPredicateGroup?.flatEntityToDelete ?? [],
    );
    const rules = removeByUniversalIdentifier(
      state.rules,
      rowLevelPermissionRule?.flatEntityToDelete ?? [],
    );

    state.fieldPermissions = fieldPermissions.kept;
    state.predicates = predicates.kept;
    state.predicateGroups = predicateGroups.kept;
    state.rules = rules.kept;

    emit({
      metadataName: 'objectPermission',
      type: 'created',
      events: createdObjectPermissions.map((after): MetadataEvent => ({
        type: 'created',
        metadataName: 'objectPermission',
        recordId: after.id,
        properties: { after },
      })),
    });
    emit({
      metadataName: 'objectPermission',
      type: 'updated',
      events: updatedObjectPermissions.map(
        ({ before, after }) =>
          ({
            type: 'updated',
            metadataName: 'objectPermission',
            recordId: before.id,
            properties: { updatedFields: [], diff: {}, before, after },
          }) as MetadataEvent,
      ),
    });
    emit({
      metadataName: 'rowLevelPermissionRule',
      type: 'deleted',
      events: rules.removed.map((before): MetadataEvent => ({
        type: 'deleted',
        metadataName: 'rowLevelPermissionRule',
        recordId: before.id,
        properties: { before },
      })),
    });

    return { status: 'success' };
  };

  // Rebuilds the grant role from its application's default role, deleting rows that exist only on the grant
  const upsertGrantRole = async ({
    applicationId,
  }: {
    workspaceId: string;
    applicationId: string;
  }): Promise<void> => {
    const flatApplication = state.applications.find(
      ({ id, deletedAt }) => id === applicationId && !isDefined(deletedAt),
    );
    const grantFlatRole = state.roles.find(
      ({ id }) => id === state.grantRoleIdByApplicationId[applicationId],
    );
    const sourceFlatRole = state.roles.find(
      ({ id }) => id === flatApplication?.defaultRoleId,
    );

    if (!isDefined(grantFlatRole) || !isDefined(sourceFlatRole)) {
      return;
    }

    const copies = state.objectPermissions
      .filter(({ roleId }) => roleId === sourceFlatRole.id)
      .map((source): FlatObjectPermission => ({
        ...source,
        id: v4(),
        universalIdentifier: v5(
          source.universalIdentifier,
          grantFlatRole.universalIdentifier,
        ),
        applicationId: grantFlatRole.applicationId,
        applicationUniversalIdentifier:
          grantFlatRole.applicationUniversalIdentifier,
        roleId: grantFlatRole.id,
        roleUniversalIdentifier: grantFlatRole.universalIdentifier,
        showInSidebar: null,
        editWindowMinutes: null,
      }));

    const previousGrantRows = state.objectPermissions.filter(
      ({ roleId }) => roleId === grantFlatRole.id,
    );

    state.objectPermissions = [
      ...state.objectPermissions.filter(
        ({ roleId }) => roleId !== grantFlatRole.id,
      ),
      ...copies,
    ];

    emit({
      metadataName: 'objectPermission',
      type: 'deleted',
      events: previousGrantRows.map((before): MetadataEvent => ({
        type: 'deleted',
        metadataName: 'objectPermission',
        recordId: before.id,
        properties: { before },
      })),
    });
    emit({
      metadataName: 'objectPermission',
      type: 'created',
      events: copies.map((after): MetadataEvent => ({
        type: 'created',
        metadataName: 'objectPermission',
        recordId: after.id,
        properties: { after },
      })),
    });
  };

  // What the settings role flow does after createRole: a full replace that drops the role's other rows
  const replaceRoleObjectPermissions = ({
    roleId,
    objectPermissions,
  }: {
    roleId: string;
    objectPermissions: FlatObjectPermission[];
  }) => {
    const previousRows = state.objectPermissions.filter(
      (objectPermission) => objectPermission.roleId === roleId,
    );

    state.objectPermissions = [
      ...state.objectPermissions.filter(
        (objectPermission) => objectPermission.roleId !== roleId,
      ),
      ...objectPermissions,
    ];

    emit({
      metadataName: 'objectPermission',
      type: 'deleted',
      events: previousRows.map((before): MetadataEvent => ({
        type: 'deleted',
        metadataName: 'objectPermission',
        recordId: before.id,
        properties: { before },
      })),
    });
    emit({
      metadataName: 'objectPermission',
      type: 'created',
      events: objectPermissions.map((after): MetadataEvent => ({
        type: 'created',
        metadataName: 'objectPermission',
        recordId: after.id,
        properties: { after },
      })),
    });
  };

  const addRole = (flatRole: FlatRole) => {
    state.roles = [...state.roles, flatRole];

    emit({
      metadataName: 'role',
      type: 'created',
      events: [
        {
          type: 'created',
          metadataName: 'role',
          recordId: flatRole.id,
          properties: { after: flatRole },
        },
      ],
    });
  };

  const takeEmittedMetadataEventBatches = (): MetadataEventBatch[] => {
    const batches = emittedMetadataEventBatches;

    emittedMetadataEventBatches = [];

    return batches;
  };

  // Same derivation as the rolesPermissions cache, so W9 checks read what the engine would enforce
  const computeRolesPermissions = (): Record<string, RoleRecordsPermissions> =>
    Object.fromEntries(
      state.roles.map((flatRole) => [
        flatRole.id,
        computeRoleRecordsPermissions({
          roleDefinition: {
            canCreateAllObjectRecords: flatRole.canCreateAllObjectRecords,
            canReadAllObjectRecords: flatRole.canReadAllObjectRecords,
            canUpdateAllObjectRecords: flatRole.canUpdateAllObjectRecords,
            canSoftDeleteAllObjectRecords:
              flatRole.canSoftDeleteAllObjectRecords,
            canDestroyAllObjectRecords: flatRole.canDestroyAllObjectRecords,
            isPermissionFlagGranted: () => false,
            objectPermissions: state.objectPermissions.filter(
              ({ roleId }) => roleId === flatRole.id,
            ),
            fieldPermissions: state.fieldPermissions.filter(
              ({ roleId }) => roleId === flatRole.id,
            ),
            rowLevelPermissionRules: state.rules.filter(
              ({ roleId }) => roleId === flatRole.id,
            ),
            rowLevelPermissionPredicates: state.predicates.filter(
              ({ roleId, deletedAt }) =>
                roleId === flatRole.id && !isDefined(deletedAt),
            ),
            rowLevelPermissionPredicateGroups: state.predicateGroups.filter(
              ({ roleId, deletedAt }) =>
                roleId === flatRole.id && !isDefined(deletedAt),
            ),
          },
          objectMetadataCollection: state.objectMetadatas,
          resolveMorphRelationPermissionFieldIds: (fieldMetadataId) => [
            fieldMetadataId,
          ],
        }),
      ]),
    );

  return {
    state,
    getOrRecompute,
    validateBuildAndRunWorkspaceMigration,
    upsertGrantRole,
    replaceRoleObjectPermissions,
    addRole,
    takeEmittedMetadataEventBatches,
    computeRolesPermissions,
  };
};

export type LockdownWorkspaceMock = ReturnType<
  typeof createLockdownWorkspaceMock
>;

// A real lockdown service over the in-memory workspace; specs spy on the dependencies
export const createLockdownServiceMock = (workspace: LockdownWorkspaceMock) => {
  const dependencies = {
    workspaceCacheService: {
      getOrRecompute: workspace.getOrRecompute,
      invalidateAndRecompute: async () => undefined,
      evictWorkspaceFromLocalCache: async () => undefined,
    },
    workspaceMigrationValidateBuildAndRunService: {
      validateBuildAndRunWorkspaceMigration:
        workspace.validateBuildAndRunWorkspaceMigration,
    },
    applicationGrantRoleService: {
      upsertGrantRole: workspace.upsertGrantRole,
    },
    cacheLockService: {
      withLock: <TResult>(task: () => Promise<TResult>) => task(),
    },
  };

  return {
    dependencies,
    service: new ReconciliationObjectLockdownService(
      dependencies.workspaceCacheService as unknown as WorkspaceCacheService,
      dependencies.workspaceMigrationValidateBuildAndRunService as unknown as WorkspaceMigrationValidateBuildAndRunService,
      dependencies.applicationGrantRoleService as unknown as ApplicationGrantRoleService,
      dependencies.cacheLockService as unknown as CacheLockService,
    ),
  };
};

// Prod shape: a relabelled standard admin, workspace roles, an app role and the 2.57 grant roles
export const buildLockdownWorkspaceFixture = () => {
  const flatApplications = {
    twentyStandard: buildLockdownFlatApplicationMock({
      id: '20202020-0000-4000-8000-0000000000a1',
      universalIdentifier: '20202020-0000-4000-8000-0000000000a1',
      name: 'Twenty Standard',
      defaultRoleId: '20202020-0000-4000-8000-0000000000b1',
    }),
    workspaceCustom: buildLockdownFlatApplicationMock({
      id: '20202020-0000-4000-8000-0000000000a2',
      universalIdentifier: '20202020-0000-4000-8000-0000000000a2',
      name: 'Workspace custom',
    }),
    complianceQa: buildLockdownFlatApplicationMock({
      id: '20202020-0000-4000-8000-0000000000a3',
      universalIdentifier: '20202020-0000-4000-8000-0000000000a3',
      name: 'Compliance QA',
      defaultRoleId: '20202020-0000-4000-8000-0000000000b5',
    }),
  };

  const flatRoles = {
    admin: buildLockdownFlatRoleMock({
      id: '20202020-0000-4000-8000-0000000000b1',
      universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
      label: 'Owner',
      isEditable: false,
      flatApplication: flatApplications.twentyStandard,
    }),
    member: buildLockdownFlatRoleMock({
      id: '20202020-0000-4000-8000-0000000000b2',
      universalIdentifier: '20202020-0000-4000-8000-0000000000c2',
      label: 'Member',
      flatApplication: flatApplications.workspaceCustom,
    }),
    agent: buildLockdownFlatRoleMock({
      id: '20202020-0000-4000-8000-0000000000b3',
      universalIdentifier: '20202020-0000-4000-8000-0000000000c3',
      label: 'Agent',
      flatApplication: flatApplications.workspaceCustom,
    }),
    relabelledAdmin: buildLockdownFlatRoleMock({
      id: '20202020-0000-4000-8000-0000000000b4',
      universalIdentifier: '20202020-0000-4000-8000-0000000000c4',
      label: 'Admin',
      flatApplication: flatApplications.workspaceCustom,
    }),
    complianceQa: buildLockdownFlatRoleMock({
      id: '20202020-0000-4000-8000-0000000000b5',
      universalIdentifier: '20202020-0000-4000-8000-0000000000c5',
      label: 'Compliance QA default function role',
      isEditable: false,
      canBeAssignedToUsers: false,
      canBeAssignedToApplications: true,
      flatApplication: flatApplications.complianceQa,
    }),
    complianceQaGrant: buildLockdownFlatRoleMock({
      id: '20202020-0000-4000-8000-0000000000b6',
      universalIdentifier: '20202020-0000-4000-8000-0000000000c6',
      label: 'Compliance QA role',
      isEditable: false,
      canBeAssignedToUsers: false,
      canBeAssignedToApplications: true,
      flatApplication: flatApplications.workspaceCustom,
    }),
    twentyStandardGrant: buildLockdownFlatRoleMock({
      id: '20202020-0000-4000-8000-0000000000b7',
      universalIdentifier: '20202020-0000-4000-8000-0000000000c7',
      label: 'Twenty Standard role',
      isEditable: false,
      canBeAssignedToUsers: false,
      canBeAssignedToApplications: true,
      flatApplication: flatApplications.workspaceCustom,
    }),
  };

  const buildObject = (nameSingular: string, index: number) =>
    getLockdownFlatObjectMetadataMock({
      id: `20202020-0000-4000-8000-0000000000d${index}`,
      nameSingular,
      flatApplication: flatApplications.workspaceCustom,
    });

  const flatObjectMetadatas = {
    reconciliation: buildObject('reconciliation', 1),
    carrierConfig: buildObject('carrierConfig', 2),
    reviewItem: buildObject('reviewItem', 3),
    reconciliationDecisionRule: buildObject('reconciliationDecisionRule', 4),
    policy: buildObject('policy', 5),
  };

  const reconciliationObjectMetadataIds = [
    flatObjectMetadatas.reconciliation.id,
    flatObjectMetadatas.carrierConfig.id,
    flatObjectMetadatas.reviewItem.id,
    flatObjectMetadatas.reconciliationDecisionRule.id,
  ];

  const memberPolicyObjectPermission = buildLockdownFlatObjectPermissionMock({
    flatRole: flatRoles.member,
    flatObjectMetadata: flatObjectMetadatas.policy,
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
    showInSidebar: true,
    editWindowMinutes: 30,
  });
  const complianceQaPolicyObjectPermission =
    buildLockdownFlatObjectPermissionMock({
      flatRole: flatRoles.complianceQa,
      flatObjectMetadata: flatObjectMetadatas.policy,
      canReadObjectRecords: true,
    });

  const agentReviewItemRule = buildLockdownFlatRuleMock({
    flatRole: flatRoles.agent,
    flatObjectMetadata: flatObjectMetadatas.reviewItem,
    canReadRecords: true,
  });
  const agentReviewItemPredicateGroup = buildLockdownFlatPredicateGroupMock({
    flatRole: flatRoles.agent,
    flatObjectMetadata: flatObjectMetadatas.reviewItem,
    rowLevelPermissionRuleId: agentReviewItemRule.id,
  });
  const agentPolicyRule = buildLockdownFlatRuleMock({
    flatRole: flatRoles.agent,
    flatObjectMetadata: flatObjectMetadatas.policy,
    canCreateRecords: true,
    canUpdateRecords: true,
  });

  const state: LockdownWorkspaceState = {
    applications: Object.values(flatApplications),
    roles: Object.values(flatRoles),
    grantRoleIdByApplicationId: {
      [flatApplications.twentyStandard.id]: flatRoles.twentyStandardGrant.id,
      [flatApplications.complianceQa.id]: flatRoles.complianceQaGrant.id,
    },
    objectMetadatas: Object.values(flatObjectMetadatas),
    objectPermissions: [
      memberPolicyObjectPermission,
      // Written by the pre-merge lockdown
      buildLockdownFlatObjectPermissionMock({
        flatRole: flatRoles.member,
        flatObjectMetadata: flatObjectMetadatas.reconciliation,
        canCreateObjectRecords: false,
        canReadObjectRecords: false,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        showInSidebar: false,
      }),
      // Predates the 2.57 create grant, so create inherits the role-wide default
      buildLockdownFlatObjectPermissionMock({
        flatRole: flatRoles.member,
        flatObjectMetadata: flatObjectMetadatas.carrierConfig,
        canReadObjectRecords: false,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        showInSidebar: false,
      }),
      complianceQaPolicyObjectPermission,
      {
        ...complianceQaPolicyObjectPermission,
        id: v4(),
        universalIdentifier: v5(
          complianceQaPolicyObjectPermission.universalIdentifier,
          flatRoles.complianceQaGrant.universalIdentifier,
        ),
        applicationId: flatApplications.workspaceCustom.id,
        applicationUniversalIdentifier:
          flatApplications.workspaceCustom.universalIdentifier,
        roleId: flatRoles.complianceQaGrant.id,
        roleUniversalIdentifier:
          flatRoles.complianceQaGrant.universalIdentifier,
      },
    ],
    fieldPermissions: [
      buildLockdownFlatFieldPermissionMock({
        flatRole: flatRoles.agent,
        flatObjectMetadata: flatObjectMetadatas.reviewItem,
        rowLevelPermissionRuleId: agentReviewItemRule.id,
      }),
    ],
    rules: [agentReviewItemRule, agentPolicyRule],
    predicates: [
      buildLockdownFlatPredicateMock({
        flatRole: flatRoles.agent,
        flatObjectMetadata: flatObjectMetadatas.reviewItem,
        rowLevelPermissionRuleId: agentReviewItemRule.id,
        rowLevelPermissionPredicateGroupId: agentReviewItemPredicateGroup.id,
      }),
      buildLockdownFlatPredicateMock({
        flatRole: flatRoles.agent,
        flatObjectMetadata: flatObjectMetadatas.policy,
        rowLevelPermissionRuleId: agentPolicyRule.id,
      }),
    ],
    predicateGroups: [agentReviewItemPredicateGroup],
  };

  return {
    flatApplications,
    flatRoles,
    flatObjectMetadatas,
    reconciliationObjectMetadataIds,
    memberPolicyObjectPermission,
    agentReviewItemRule,
    agentPolicyRule,
    state,
  };
};
