import { Injectable, Logger } from '@nestjs/common';

import { getObjectPermissionUniversalIdentifier } from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';

import { ApplicationGrantRoleService } from 'src/engine/core-modules/application/application-grant-role/services/application-grant-role.service';
import { type FlatApplicationCacheMaps } from 'src/engine/core-modules/application/types/flat-application-cache-maps.type';
import { CacheLockService } from 'src/engine/core-modules/cache-lock/cache-lock.service';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldPermission } from 'src/engine/metadata-modules/flat-field-permission/types/flat-field-permission.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRoleMaps } from 'src/engine/metadata-modules/flat-role/types/flat-role-maps.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { type FlatRoleTargetByApplicationIdMaps } from 'src/engine/metadata-modules/role-target/types/flat-role-target-by-application-id-maps.type';
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { type UniversalFlatObjectPermission } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-object-permission.type';

// Carrier book-of-business rows carry names and dates of birth, so only the standard admin may reach them
export const RECONCILIATION_ADMIN_ONLY_OBJECT_NAMES = [
  'reconciliation',
  'carrierConfig',
  'reviewItem',
  'reconciliationDecisionRule',
];

const RECONCILIATION_OBJECT_LOCKDOWN_LOCK_OPTIONS = {
  ms: 200,
  maxRetries: 150,
};

const buildReconciliationObjectLockdownLockKey = (workspaceId: string) =>
  `reconciliation-object-lockdown:${workspaceId}`;

const DENYING_OBJECT_PERMISSION = {
  canCreateObjectRecords: false,
  canReadObjectRecords: false,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
  showInSidebar: false,
  editWindowMinutes: null,
} as const;

export type ReconciliationObjectLockdownResult = {
  objectCount: number;
  // Every non-admin role, all locked once the call returns
  lockedRoleLabels: string[];
  // The roles that needed a write, or would on a dry run
  changedRoleIds: string[];
};

type ReconciliationObjectLockdownState = {
  reconciliationFlatObjectMetadatas: FlatObjectMetadata[];
  flatRoleMaps: FlatRoleMaps;
  flatApplicationMaps: FlatApplicationCacheMaps;
  flatRoleTargetByApplicationIdMaps: FlatRoleTargetByApplicationIdMaps;
  objectPermissions: FlatObjectPermission[];
  fieldPermissions: FlatFieldPermission[];
  rules: FlatRowLevelPermissionRule[];
  predicates: FlatRowLevelPermissionPredicate[];
  predicateGroups: FlatRowLevelPermissionPredicateGroup[];
};

type RoleLockdownOperations = {
  objectPermissionsToCreate: UniversalFlatObjectPermission[];
  objectPermissionsToUpdate: UniversalFlatObjectPermission[];
  rulesToDelete: FlatRowLevelPermissionRule[];
  predicateGroupsToDelete: FlatRowLevelPermissionPredicateGroup[];
  predicatesToDelete: FlatRowLevelPermissionPredicate[];
  fieldPermissionsToDelete: FlatFieldPermission[];
};

const isStandardAdminFlatRole = ({
  universalIdentifier,
}: Pick<FlatRole, 'universalIdentifier'>): boolean =>
  universalIdentifier === STANDARD_ROLE.admin.universalIdentifier;

// A null grant inherits the role-wide default, so only an explicit false denies
const isDenyingObjectPermission = (
  objectPermission: FlatObjectPermission,
): boolean =>
  objectPermission.canCreateObjectRecords === false &&
  objectPermission.canReadObjectRecords === false &&
  objectPermission.canUpdateObjectRecords === false &&
  objectPermission.canSoftDeleteObjectRecords === false &&
  objectPermission.canDestroyObjectRecords === false &&
  objectPermission.showInSidebar !== true;

const findLockableFlatRole = ({
  roleId,
  state,
}: {
  roleId: string | null | undefined;
  state: ReconciliationObjectLockdownState;
}): FlatRole | undefined => {
  if (!isDefined(roleId)) {
    return undefined;
  }

  const flatRole = findFlatEntityByIdInFlatEntityMaps({
    flatEntityId: roleId,
    flatEntityMaps: state.flatRoleMaps,
  });

  return isDefined(flatRole) && !isStandardAdminFlatRole(flatRole)
    ? flatRole
    : undefined;
};

// Mirrors resolveApplicationGrantRoleId: the grant role is the role an application's role target points at
const findGrantedApplicationId = ({
  roleId,
  state,
}: {
  roleId: string;
  state: ReconciliationObjectLockdownState;
}): string | undefined =>
  Object.entries(state.flatRoleTargetByApplicationIdMaps).find(
    ([, flatRoleTarget]) => flatRoleTarget?.roleId === roleId,
  )?.[0];

const findApplicationIdsCopyingRole = ({
  roleId,
  state,
}: {
  roleId: string;
  state: ReconciliationObjectLockdownState;
}): string[] =>
  Object.keys(state.flatRoleTargetByApplicationIdMaps).filter(
    (applicationId) =>
      state.flatApplicationMaps.byId[applicationId]?.defaultRoleId === roleId,
  );

const computeRoleLockdownOperations = ({
  flatRole,
  state,
  now,
}: {
  flatRole: FlatRole;
  state: ReconciliationObjectLockdownState;
  now: string;
}): RoleLockdownOperations => {
  const reconciliationObjectMetadataIds = new Set(
    state.reconciliationFlatObjectMetadatas.map(({ id }) => id),
  );
  const isOnRoleReconciliationObject = ({
    roleId,
    objectMetadataId,
  }: {
    roleId: string;
    objectMetadataId: string;
  }) =>
    roleId === flatRole.id &&
    reconciliationObjectMetadataIds.has(objectMetadataId);

  const objectPermissionByObjectMetadataId = new Map(
    state.objectPermissions
      .filter(isOnRoleReconciliationObject)
      .map((objectPermission) => [
        objectPermission.objectMetadataId,
        objectPermission,
      ]),
  );

  const objectPermissionsToCreate: UniversalFlatObjectPermission[] = [];
  const objectPermissionsToUpdate: UniversalFlatObjectPermission[] = [];

  for (const flatObjectMetadata of state.reconciliationFlatObjectMetadatas) {
    const objectPermission = objectPermissionByObjectMetadataId.get(
      flatObjectMetadata.id,
    );

    if (!isDefined(objectPermission)) {
      objectPermissionsToCreate.push({
        universalIdentifier: getObjectPermissionUniversalIdentifier({
          applicationUniversalIdentifier:
            flatRole.applicationUniversalIdentifier,
          roleUniversalIdentifier: flatRole.universalIdentifier,
          objectUniversalIdentifier: flatObjectMetadata.universalIdentifier,
        }),
        applicationUniversalIdentifier: flatRole.applicationUniversalIdentifier,
        roleUniversalIdentifier: flatRole.universalIdentifier,
        objectMetadataUniversalIdentifier:
          flatObjectMetadata.universalIdentifier,
        ...DENYING_OBJECT_PERMISSION,
        createdAt: now,
        updatedAt: now,
      });

      continue;
    }

    if (!isDenyingObjectPermission(objectPermission)) {
      objectPermissionsToUpdate.push({
        universalIdentifier: objectPermission.universalIdentifier,
        applicationUniversalIdentifier:
          objectPermission.applicationUniversalIdentifier,
        roleUniversalIdentifier: objectPermission.roleUniversalIdentifier,
        objectMetadataUniversalIdentifier:
          objectPermission.objectMetadataUniversalIdentifier,
        ...DENYING_OBJECT_PERMISSION,
        createdAt: objectPermission.createdAt,
        updatedAt: now,
      });
    }
  }

  // A v2.58 rule grants records on its own, and zeroing its grants instead would fail W9
  const rulesToDelete = state.rules.filter(isOnRoleReconciliationObject);
  const ruleIdsToDelete = new Set(rulesToDelete.map(({ id }) => id));
  const isLinkedToRuleToDelete = (ruleId: string | null) =>
    isDefined(ruleId) && ruleIdsToDelete.has(ruleId);

  const predicateGroupsToDelete = state.predicateGroups.filter(
    (predicateGroup) =>
      isOnRoleReconciliationObject(predicateGroup) ||
      isLinkedToRuleToDelete(predicateGroup.rowLevelPermissionRuleId),
  );
  const predicateGroupIdsToDelete = new Set(
    predicateGroupsToDelete.map(({ id }) => id),
  );
  const isInPredicateGroupToDelete = (predicateGroupId: string | null) =>
    isDefined(predicateGroupId) &&
    predicateGroupIdsToDelete.has(predicateGroupId);

  const predicatesToDelete = state.predicates.filter(
    (predicate) =>
      isOnRoleReconciliationObject(predicate) ||
      isLinkedToRuleToDelete(predicate.rowLevelPermissionRuleId) ||
      isInPredicateGroupToDelete(predicate.rowLevelPermissionPredicateGroupId),
  );

  // The database cascades these with their rule or group; deleting them here keeps the cache in step
  const fieldPermissionsToDelete = state.fieldPermissions.filter(
    (fieldPermission) =>
      isLinkedToRuleToDelete(fieldPermission.rowLevelPermissionRuleId) ||
      isInPredicateGroupToDelete(
        fieldPermission.rowLevelPermissionPredicateGroupId,
      ),
  );

  return {
    objectPermissionsToCreate,
    objectPermissionsToUpdate,
    rulesToDelete,
    predicateGroupsToDelete,
    predicatesToDelete,
    fieldPermissionsToDelete,
  };
};

const hasRoleLockdownOperations = (
  roleLockdownOperations: RoleLockdownOperations,
): boolean =>
  Object.values(roleLockdownOperations).some(
    (operations) => operations.length > 0,
  );

const isRoleLocked = ({
  roleId,
  state,
}: {
  roleId: string;
  state: ReconciliationObjectLockdownState;
}): boolean => {
  const flatRole = findLockableFlatRole({ roleId, state });

  return (
    !isDefined(flatRole) ||
    !hasRoleLockdownOperations(
      computeRoleLockdownOperations({
        flatRole,
        state,
        now: new Date().toISOString(),
      }),
    )
  );
};

// Denies every role but the standard admin all access to the reconciliation objects. Writes touch
// only the rows on those objects, so a role's other permissions, sidebar visibility and edit window
// stay as they are. Idempotent: an already locked role is a no-op.
@Injectable()
export class ReconciliationObjectLockdownService {
  private readonly logger = new Logger(
    ReconciliationObjectLockdownService.name,
  );

  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly applicationGrantRoleService: ApplicationGrantRoleService,
    private readonly cacheLockService: CacheLockService,
  ) {}

  public async applyToRole({
    workspaceId,
    roleId,
  }: {
    workspaceId: string;
    roleId: string;
  }): Promise<void> {
    await this.withWorkspaceLock(workspaceId, () =>
      this.lockRoleAndGrantCopies({ workspaceId, roleId }),
    );
  }

  public async applyToAllNonAdminRoles({
    workspaceId,
    dryRun = false,
  }: {
    workspaceId: string;
    dryRun?: boolean;
  }): Promise<ReconciliationObjectLockdownResult> {
    const state = await this.getFreshLockdownState(workspaceId);

    if (state.reconciliationFlatObjectMetadatas.length === 0) {
      return { objectCount: 0, lockedRoleLabels: [], changedRoleIds: [] };
    }

    const nonAdminFlatRoles = Object.values(
      state.flatRoleMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter((flatRole) => !isStandardAdminFlatRole(flatRole));

    const objectCount = state.reconciliationFlatObjectMetadatas.length;
    const lockedRoleLabels = nonAdminFlatRoles.map(({ label }) => label);

    if (dryRun) {
      return {
        objectCount,
        lockedRoleLabels,
        changedRoleIds: nonAdminFlatRoles
          .filter((flatRole) => !isRoleLocked({ roleId: flatRole.id, state }))
          .map(({ id }) => id),
      };
    }

    // Grant roles are rebuilt from their source role, so the sources go first
    const orderedFlatRoles = [
      ...nonAdminFlatRoles.filter(
        ({ id }) => !isDefined(findGrantedApplicationId({ roleId: id, state })),
      ),
      ...nonAdminFlatRoles.filter(({ id }) =>
        isDefined(findGrantedApplicationId({ roleId: id, state })),
      ),
    ];

    const changedRoleIds = new Set<string>();

    for (const flatRole of orderedFlatRoles) {
      const lockedRoleIds = await this.withWorkspaceLock(workspaceId, () =>
        this.lockRoleAndGrantCopies({ workspaceId, roleId: flatRole.id }),
      );

      for (const lockedRoleId of lockedRoleIds) {
        changedRoleIds.add(lockedRoleId);
      }
    }

    return {
      objectCount,
      lockedRoleLabels,
      changedRoleIds: [...changedRoleIds],
    };
  }

  public async findReconciliationObjectMetadataIds(
    workspaceId: string,
  ): Promise<Set<string>> {
    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
      ]);

    return new Set(
      Object.values(flatObjectMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .filter(({ nameSingular }) =>
          RECONCILIATION_ADMIN_ONLY_OBJECT_NAMES.includes(nameSingular),
        )
        .map(({ id }) => id),
    );
  }

  // The metadata listeners and the upgrade write the same rows, so writes for a workspace run one at a time
  private async withWorkspaceLock<TResult>(
    workspaceId: string,
    task: () => Promise<TResult>,
  ): Promise<TResult> {
    return this.cacheLockService.withLock(
      task,
      buildReconciliationObjectLockdownLockKey(workspaceId),
      RECONCILIATION_OBJECT_LOCKDOWN_LOCK_OPTIONS,
    );
  }

  // Returns the ids of the roles that were written
  private async lockRoleAndGrantCopies({
    workspaceId,
    roleId,
  }: {
    workspaceId: string;
    roleId: string;
  }): Promise<string[]> {
    const state = await this.getFreshLockdownState(workspaceId);

    if (
      state.reconciliationFlatObjectMetadatas.length === 0 ||
      !isDefined(findLockableFlatRole({ roleId, state }))
    ) {
      return [];
    }

    const grantedApplicationId = findGrantedApplicationId({ roleId, state });

    if (isDefined(grantedApplicationId)) {
      return this.lockGrantRole({
        workspaceId,
        applicationId: grantedApplicationId,
      });
    }

    const lockedRoleIds = (await this.writeRoleLockdown({
      workspaceId,
      roleId,
      state,
    }))
      ? [roleId]
      : [];

    for (const applicationId of findApplicationIdsCopyingRole({
      roleId,
      state,
    })) {
      lockedRoleIds.push(
        ...(await this.lockGrantRole({ workspaceId, applicationId })),
      );
    }

    return [...new Set(lockedRoleIds)];
  }

  // A grant role is rebuilt from its application's default role, so the deny rows go on that role and a
  // re-sync copies them. The twenty-standard grant copies the standard admin and is locked in place: a
  // later re-sync drops those rows, and the listener locks it again.
  private async lockGrantRole({
    workspaceId,
    applicationId,
  }: {
    workspaceId: string;
    applicationId: string;
  }): Promise<string[]> {
    const state = await this.getFreshLockdownState(workspaceId);
    const grantRoleId =
      state.flatRoleTargetByApplicationIdMaps[applicationId]?.roleId;

    if (!isDefined(grantRoleId)) {
      return [];
    }

    const sourceFlatRole = findLockableFlatRole({
      roleId: state.flatApplicationMaps.byId[applicationId]?.defaultRoleId,
      state,
    });
    const lockedRoleIds: string[] = [];

    if (isDefined(sourceFlatRole)) {
      if (
        await this.writeRoleLockdown({
          workspaceId,
          roleId: sourceFlatRole.id,
          state,
        })
      ) {
        lockedRoleIds.push(sourceFlatRole.id);
      }

      if (
        !isRoleLocked({
          roleId: grantRoleId,
          state: await this.getFreshLockdownState(workspaceId),
        })
      ) {
        await this.resyncGrantRole({ workspaceId, applicationId });
        lockedRoleIds.push(grantRoleId);
      }
    }

    if (
      await this.writeRoleLockdown({
        workspaceId,
        roleId: grantRoleId,
        state: await this.getFreshLockdownState(workspaceId),
      })
    ) {
      lockedRoleIds.push(grantRoleId);
    }

    return [...new Set(lockedRoleIds)];
  }

  private async resyncGrantRole({
    workspaceId,
    applicationId,
  }: {
    workspaceId: string;
    applicationId: string;
  }): Promise<void> {
    try {
      await this.applicationGrantRoleService.upsertGrantRole({
        workspaceId,
        applicationId,
      });
    } catch (error) {
      // The caller then locks the grant role in place, so a failed re-sync does not leave it open
      this.logger.error(
        `Could not re-sync the grant role of application ${applicationId} in workspace ${workspaceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // The state must be read right before this call: it is the base the write is computed from
  private async writeRoleLockdown({
    workspaceId,
    roleId,
    state,
  }: {
    workspaceId: string;
    roleId: string;
    state: ReconciliationObjectLockdownState;
  }): Promise<boolean> {
    const flatRole = findLockableFlatRole({ roleId, state });

    if (!isDefined(flatRole)) {
      return false;
    }

    const roleLockdownOperations = computeRoleLockdownOperations({
      flatRole,
      state,
      now: new Date().toISOString(),
    });

    if (!hasRoleLockdownOperations(roleLockdownOperations)) {
      return false;
    }

    const {
      objectPermissionsToCreate,
      objectPermissionsToUpdate,
      rulesToDelete,
      predicateGroupsToDelete,
      predicatesToDelete,
      fieldPermissionsToDelete,
    } = roleLockdownOperations;

    // A system build owned by the role's application: the role permission API rejects app and grant roles
    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          allFlatEntityOperationByMetadataName: {
            objectPermission: {
              flatEntityToCreate: objectPermissionsToCreate,
              flatEntityToUpdate: objectPermissionsToUpdate,
              flatEntityToDelete: [],
            },
            rowLevelPermissionRule: {
              flatEntityToCreate: [],
              flatEntityToUpdate: [],
              flatEntityToDelete: rulesToDelete,
            },
            rowLevelPermissionPredicateGroup: {
              flatEntityToCreate: [],
              flatEntityToUpdate: [],
              flatEntityToDelete: predicateGroupsToDelete,
            },
            rowLevelPermissionPredicate: {
              flatEntityToCreate: [],
              flatEntityToUpdate: [],
              flatEntityToDelete: predicatesToDelete,
            },
            fieldPermission: {
              flatEntityToCreate: [],
              flatEntityToUpdate: [],
              flatEntityToDelete: fieldPermissionsToDelete,
            },
          },
          workspaceId,
          isSystemBuild: true,
          applicationUniversalIdentifier:
            flatRole.applicationUniversalIdentifier,
        },
      );

    if (result.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        result,
        `Validation errors occurred while locking the reconciliation objects for role ${roleId}`,
      );
    }

    // The runner leaves the derived permissions cache alone when only rules change
    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'rolesPermissions',
    ]);

    this.logger.log(
      `Workspace ${workspaceId}: locked role ${roleId} out of ${state.reconciliationFlatObjectMetadatas.length} reconciliation object(s) (${objectPermissionsToCreate.length} deny row(s) created, ${objectPermissionsToUpdate.length} updated, ${rulesToDelete.length} rule(s) deleted)`,
    );

    return true;
  }

  private async getFreshLockdownState(
    workspaceId: string,
  ): Promise<ReconciliationObjectLockdownState> {
    // Another process may have changed the permissions since this one cached them
    await this.workspaceCacheService.evictWorkspaceFromLocalCache(workspaceId);

    const {
      flatApplicationMaps,
      flatRoleMaps,
      flatRoleTargetByApplicationIdMaps,
      flatObjectMetadataMaps,
      flatObjectPermissionMaps,
      flatFieldPermissionMaps,
      flatRowLevelPermissionRuleMaps,
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatApplicationMaps',
      'flatRoleMaps',
      'flatRoleTargetByApplicationIdMaps',
      'flatObjectMetadataMaps',
      'flatObjectPermissionMaps',
      'flatFieldPermissionMaps',
      'flatRowLevelPermissionRuleMaps',
      'flatRowLevelPermissionPredicateMaps',
      'flatRowLevelPermissionPredicateGroupMaps',
    ]);

    return {
      reconciliationFlatObjectMetadatas: Object.values(
        flatObjectMetadataMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter(({ nameSingular }) =>
          RECONCILIATION_ADMIN_ONLY_OBJECT_NAMES.includes(nameSingular),
        ),
      flatRoleMaps,
      flatApplicationMaps,
      flatRoleTargetByApplicationIdMaps,
      objectPermissions: Object.values(
        flatObjectPermissionMaps.byUniversalIdentifier,
      ).filter(isDefined),
      fieldPermissions: Object.values(
        flatFieldPermissionMaps.byUniversalIdentifier,
      ).filter(isDefined),
      rules: Object.values(
        flatRowLevelPermissionRuleMaps.byUniversalIdentifier,
      ).filter(isDefined),
      predicates: Object.values(
        flatRowLevelPermissionPredicateMaps.byUniversalIdentifier,
      ).filter(isDefined),
      predicateGroups: Object.values(
        flatRowLevelPermissionPredicateGroupMaps.byUniversalIdentifier,
      ).filter(isDefined),
    };
  }
}
