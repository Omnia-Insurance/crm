import { Injectable, Logger } from '@nestjs/common';

import { getObjectPermissionUniversalIdentifier } from 'twenty-shared/application';
import {
  type FieldMetadataComplexOption,
  FieldMetadataType,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { RowLevelPermissionPredicateService } from 'src/engine/metadata-modules/row-level-permission-predicate/services/row-level-permission-predicate.service';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { DASHBOARD_AUDIENCE_FIELD_NAME } from 'src/modules/dashboard/dashboard-audience/constants/dashboard-audience-field-name.constant';
import { type DashboardAudienceObjectPermissionGrants } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-object-permission-grants.type';
import { type DashboardAudienceRoleRows } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-rows.type';
import { type DashboardAudienceRoleSyncPlan } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-sync-plan.type';
import { areDashboardAudienceOptionsEqual } from 'src/modules/dashboard/dashboard-audience/utils/are-dashboard-audience-options-equal.util';
import { computeDashboardAudienceOptions } from 'src/modules/dashboard/dashboard-audience/utils/compute-dashboard-audience-options.util';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';
import { findDashboardAudienceField } from 'src/modules/dashboard/dashboard-audience/utils/find-dashboard-audience-field.util';
import { findDashboardAudienceRoleRows } from 'src/modules/dashboard/dashboard-audience/utils/find-dashboard-audience-role-rows.util';
import { findDashboardFlatObjectMetadata } from 'src/modules/dashboard/dashboard-audience/utils/find-dashboard-flat-object-metadata.util';
import { getDashboardAudiencePredicateIds } from 'src/modules/dashboard/dashboard-audience/utils/get-dashboard-audience-predicate-ids.util';
import { isDashboardAudienceGatedRole } from 'src/modules/dashboard/dashboard-audience/utils/is-dashboard-audience-gated-role.util';
import { planDashboardAudienceRoleSync } from 'src/modules/dashboard/dashboard-audience/utils/plan-dashboard-audience-role-sync.util';

type DashboardAudienceSyncOptions = {
  dryRun?: boolean;
};

type RoleAndObjectIds = { roleId: string; objectMetadataId: string };

const describeDashboardAudienceRoleSyncPlan = ({
  objectPermissionGrants,
  audienceRuleGrants,
  shouldRemoveRowLevelPermissions,
}: DashboardAudienceRoleSyncPlan): string[] => [
  ...(isDefined(objectPermissionGrants)
    ? ['set the dashboard object permission']
    : []),
  ...(isDefined(audienceRuleGrants) ? ['write the audience rule'] : []),
  ...(shouldRemoveRowLevelPermissions
    ? ['remove the dashboard row level permissions']
    : []),
];

// Keeps the dashboard audience field and every role's audience rule in line with the workspace roles
// (contract C1): a gated role reaches dashboards only through `audience CONTAINS <its token>`
@Injectable()
export class DashboardAudienceRoleSyncService {
  private readonly logger = new Logger(DashboardAudienceRoleSyncService.name);
  // Our own writes emit the events this service reacts to: one sync at a time per workspace keeps the
  // nested sync from racing the one that triggered it
  private readonly pendingSyncByWorkspaceId = new Map<string, Promise<void>>();

  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly rowLevelPermissionPredicateService: RowLevelPermissionPredicateService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
  ) {}

  async syncWorkspace(
    workspaceId: string,
    options?: DashboardAudienceSyncOptions,
  ): Promise<void> {
    const dryRun = options?.dryRun ?? false;
    const logPrefix = `${dryRun ? '[DRY RUN] ' : ''}Workspace ${workspaceId}:`;

    await this.runExclusively(workspaceId, async () => {
      if (!(await this.isRowLevelPermissionAvailable(workspaceId, logPrefix))) {
        return;
      }

      const {
        flatRoleMaps,
        roleIdsWithAllRecordsAccess,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
      } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatRoleMaps',
        'roleIdsWithAllRecordsAccess',
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
      ]);

      const dashboardFlatObjectMetadata = findDashboardFlatObjectMetadata(
        flatObjectMetadataMaps,
      );

      if (!isDefined(dashboardFlatObjectMetadata)) {
        this.logger.log(`${logPrefix} no dashboard object, nothing to sync`);

        return;
      }

      const flatRoles = Object.values(
        flatRoleMaps.byUniversalIdentifier,
      ).filter(isDefined);

      await this.syncAudienceField({
        workspaceId,
        dashboardFlatObjectMetadata,
        gatedFlatRoles: flatRoles.filter((flatRole) =>
          isDashboardAudienceGatedRole({
            flatRole,
            roleIdsWithAllRecordsAccess,
          }),
        ),
        flatFieldMetadataMaps,
        dryRun,
        logPrefix,
      });

      await this.syncRoles({
        workspaceId,
        roleIds: flatRoles.map(({ id }) => id),
        dryRun,
        logPrefix,
      });
    });
  }

  async syncDashboardObjectPermissionChanges({
    workspaceId,
    objectPermissions,
  }: {
    workspaceId: string;
    objectPermissions: RoleAndObjectIds[];
  }): Promise<void> {
    const logPrefix = `Workspace ${workspaceId}:`;

    await this.runExclusively(workspaceId, async () => {
      const { flatObjectMetadataMaps } =
        await this.workspaceCacheService.getOrRecompute(workspaceId, [
          'flatObjectMetadataMaps',
        ]);

      const dashboardFlatObjectMetadata = findDashboardFlatObjectMetadata(
        flatObjectMetadataMaps,
      );

      const roleIds = [
        ...new Set(
          objectPermissions
            .filter(
              ({ objectMetadataId }) =>
                objectMetadataId === dashboardFlatObjectMetadata?.id,
            )
            .map(({ roleId }) => roleId),
        ),
      ];

      if (
        roleIds.length === 0 ||
        !(await this.isRowLevelPermissionAvailable(workspaceId, logPrefix))
      ) {
        return;
      }

      await this.syncRoles({ workspaceId, roleIds, dryRun: false, logPrefix });
    });
  }

  private async runExclusively(
    workspaceId: string,
    sync: () => Promise<void>,
  ): Promise<void> {
    const previousSync =
      this.pendingSyncByWorkspaceId.get(workspaceId) ?? Promise.resolve();
    const currentSync = previousSync.then(sync);
    const settledSync = currentSync.catch(() => undefined);

    this.pendingSyncByWorkspaceId.set(workspaceId, settledSync);

    try {
      await currentSync;
    } finally {
      if (this.pendingSyncByWorkspaceId.get(workspaceId) === settledSync) {
        this.pendingSyncByWorkspaceId.delete(workspaceId);
      }
    }
  }

  private async isRowLevelPermissionAvailable(
    workspaceId: string,
    logPrefix: string,
  ): Promise<boolean> {
    const isAvailable =
      await this.rowLevelPermissionPredicateService.hasRowLevelPermissionFeature(
        workspaceId,
      );

    if (!isAvailable) {
      this.logger.warn(
        `${logPrefix} row level permissions are unavailable, dashboard audience left as is`,
      );
    }

    return isAvailable;
  }

  private async syncAudienceField({
    workspaceId,
    dashboardFlatObjectMetadata,
    gatedFlatRoles,
    flatFieldMetadataMaps,
    dryRun,
    logPrefix,
  }: {
    workspaceId: string;
    dashboardFlatObjectMetadata: FlatObjectMetadata;
    gatedFlatRoles: FlatRole[];
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
    dryRun: boolean;
    logPrefix: string;
  }): Promise<void> {
    const audienceFlatFieldMetadata = findDashboardAudienceField({
      dashboardObjectMetadataId: dashboardFlatObjectMetadata.id,
      flatFieldMetadataMaps,
    });

    if (!isDefined(audienceFlatFieldMetadata)) {
      if (gatedFlatRoles.length === 0) {
        return;
      }

      this.logger.log(
        `${logPrefix} creating the dashboard ${DASHBOARD_AUDIENCE_FIELD_NAME} field with ${gatedFlatRoles.length} role option(s)`,
      );

      if (dryRun) {
        return;
      }

      await this.fieldMetadataService.createOneField({
        createFieldInput: {
          objectMetadataId: dashboardFlatObjectMetadata.id,
          type: FieldMetadataType.MULTI_SELECT,
          name: DASHBOARD_AUDIENCE_FIELD_NAME,
          label: 'Audience',
          description:
            'Roles that can access this dashboard. Empty means admins only. Synced from workspace roles.',
          icon: 'IconUsers',
          isLabelSyncedWithName: false,
          options: computeDashboardAudienceOptions({
            gatedFlatRoles,
            currentOptions: [],
          }),
        },
        workspaceId,
      });

      return;
    }

    if (
      !isFlatFieldMetadataOfType(
        audienceFlatFieldMetadata,
        FieldMetadataType.MULTI_SELECT,
      )
    ) {
      throw new Error(
        `${logPrefix} field ${audienceFlatFieldMetadata.id} is not a multi-select, so it cannot hold the dashboard audience`,
      );
    }

    const currentOptions: FieldMetadataComplexOption[] =
      audienceFlatFieldMetadata.options ?? [];
    const desiredOptions = computeDashboardAudienceOptions({
      gatedFlatRoles,
      currentOptions,
    });

    if (areDashboardAudienceOptionsEqual(currentOptions, desiredOptions)) {
      return;
    }

    this.logger.log(
      `${logPrefix} syncing the dashboard ${DASHBOARD_AUDIENCE_FIELD_NAME} field ${audienceFlatFieldMetadata.id} to ${desiredOptions.length} role option(s)`,
    );

    if (dryRun) {
      return;
    }

    // updateOneField migrates the field's enum; a raw options write would leave it stale
    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: audienceFlatFieldMetadata.id,
        options: desiredOptions,
      },
      workspaceId,
    });
  }

  private async syncRoles({
    workspaceId,
    roleIds,
    dryRun,
    logPrefix,
  }: {
    workspaceId: string;
    roleIds: string[];
    dryRun: boolean;
    logPrefix: string;
  }): Promise<void> {
    const failedRoleIds: string[] = [];
    let changedRoleCount = 0;

    for (const roleId of [...roleIds].sort()) {
      try {
        const hasChanged = await this.syncRole({
          workspaceId,
          roleId,
          dryRun,
          logPrefix,
        });

        changedRoleCount += hasChanged ? 1 : 0;
      } catch (error) {
        failedRoleIds.push(roleId);
        this.logger.error(
          `${logPrefix} dashboard audience sync failed for role ${roleId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (changedRoleCount > 0) {
      this.logger.log(
        `${logPrefix} dashboard audience ${dryRun ? 'would change' : 'changed'} ${changedRoleCount} of ${roleIds.length} role(s)`,
      );
    }

    if (failedRoleIds.length > 0) {
      throw new Error(
        `${logPrefix} dashboard audience sync failed for role(s) ${failedRoleIds.join(', ')}`,
      );
    }
  }

  // Each role is planned from the caches as they are just before its own writes
  private async syncRole({
    workspaceId,
    roleId,
    dryRun,
    logPrefix,
  }: {
    workspaceId: string;
    roleId: string;
    dryRun: boolean;
    logPrefix: string;
  }): Promise<boolean> {
    const {
      flatRoleMaps,
      roleIdsWithAllRecordsAccess,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatObjectPermissionMaps,
      flatRowLevelPermissionRuleMaps,
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatRoleMaps',
      'roleIdsWithAllRecordsAccess',
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatObjectPermissionMaps',
      'flatRowLevelPermissionRuleMaps',
      'flatRowLevelPermissionPredicateMaps',
      'flatRowLevelPermissionPredicateGroupMaps',
    ]);

    const flatRole = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: roleId,
      flatEntityMaps: flatRoleMaps,
    });
    const dashboardFlatObjectMetadata = findDashboardFlatObjectMetadata(
      flatObjectMetadataMaps,
    );

    if (!isDefined(flatRole) || !isDefined(dashboardFlatObjectMetadata)) {
      return false;
    }

    const audienceFlatFieldMetadata = findDashboardAudienceField({
      dashboardObjectMetadataId: dashboardFlatObjectMetadata.id,
      flatFieldMetadataMaps,
    });
    const audiencePredicateIds = getDashboardAudiencePredicateIds({
      roleId,
      dashboardObjectMetadataId: dashboardFlatObjectMetadata.id,
    });
    const roleRows = findDashboardAudienceRoleRows({
      roleId,
      dashboardObjectMetadataId: dashboardFlatObjectMetadata.id,
      flatObjectPermissionMaps,
      flatRowLevelPermissionRuleMaps,
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
    });

    const plan = planDashboardAudienceRoleSync({
      flatRole,
      isGated: isDashboardAudienceGatedRole({
        flatRole,
        roleIdsWithAllRecordsAccess,
      }),
      dashboardFlatObjectMetadata,
      audienceFieldMetadataId: audienceFlatFieldMetadata?.id,
      audiencePredicateIds,
      roleRows,
    });

    const changes = describeDashboardAudienceRoleSyncPlan(plan);

    if (changes.length === 0) {
      return false;
    }

    this.logger.log(`${logPrefix} role ${roleId}: ${changes.join(', ')}`);

    if (dryRun) {
      return true;
    }

    // The rule goes before the denial: if the denial then fails, the role keeps the access it had and a
    // retry reads its grants back from the rule, where a denied object permission would read as none
    if (isDefined(plan.audienceRuleGrants)) {
      if (!isDefined(audienceFlatFieldMetadata)) {
        throw new Error(
          `the dashboard ${DASHBOARD_AUDIENCE_FIELD_NAME} field does not exist`,
        );
      }

      await this.rowLevelPermissionPredicateService.upsertRowLevelPermissionPredicates(
        {
          workspaceId,
          input: {
            roleId,
            objectMetadataId: dashboardFlatObjectMetadata.id,
            predicates: [
              {
                id: this.pickAudiencePredicateId({
                  audiencePredicateIds,
                  roleRows,
                  flatRowLevelPermissionPredicateMaps,
                }),
                fieldMetadataId: audienceFlatFieldMetadata.id,
                relationFieldMetadataId: null,
                operand: RowLevelPermissionPredicateOperand.CONTAINS,
                // A JSON array of option values, as the multi-select filter reads it
                value: JSON.stringify([
                  encodeDashboardAudienceRoleToken(roleId),
                ]),
                subFieldName: null,
                workspaceMemberFieldMetadataId: null,
                workspaceMemberSubFieldName: null,
                rowLevelPermissionPredicateGroupId: null,
                positionInRowLevelPermissionPredicateGroup: null,
              },
            ],
            predicateGroups: [],
            ...plan.audienceRuleGrants,
          },
        },
      );
    }

    if (isDefined(plan.objectPermissionGrants)) {
      await this.writeDashboardObjectPermission({
        workspaceId,
        flatRole,
        dashboardFlatObjectMetadata,
        objectPermission: roleRows.objectPermission,
        grants: plan.objectPermissionGrants,
      });
    }

    if (plan.shouldRemoveRowLevelPermissions) {
      await this.rowLevelPermissionPredicateService.upsertRowLevelPermissionPredicates(
        {
          workspaceId,
          input: {
            roleId,
            objectMetadataId: dashboardFlatObjectMetadata.id,
            predicates: [],
            predicateGroups: [],
          },
        },
      );
    }

    return true;
  }

  private pickAudiencePredicateId({
    audiencePredicateIds,
    roleRows,
    flatRowLevelPermissionPredicateMaps,
  }: {
    audiencePredicateIds: string[];
    roleRows: DashboardAudienceRoleRows;
    flatRowLevelPermissionPredicateMaps: FlatEntityMaps<FlatRowLevelPermissionPredicate>;
  }): string {
    const livePredicateId = roleRows.predicates.find(({ id }) =>
      audiencePredicateIds.includes(id),
    )?.id;

    const audiencePredicateId =
      livePredicateId ??
      audiencePredicateIds.find(
        (predicateId) =>
          !isDefined(
            findFlatEntityByIdInFlatEntityMaps({
              flatEntityId: predicateId,
              flatEntityMaps: flatRowLevelPermissionPredicateMaps,
            }),
          ),
      );

    if (!isDefined(audiencePredicateId)) {
      throw new Error(
        `audience predicates ${audiencePredicateIds.join(', ')} are all soft-deleted`,
      );
    }

    return audiencePredicateId;
  }

  // Writes only the dashboard row, so other objects' permissions, such as the reconciliation lockdown, stay
  // untouched. Built as the role's application: the object permission API only accepts the custom one
  private async writeDashboardObjectPermission({
    workspaceId,
    flatRole,
    dashboardFlatObjectMetadata,
    objectPermission,
    grants,
  }: {
    workspaceId: string;
    flatRole: FlatRole;
    dashboardFlatObjectMetadata: FlatObjectMetadata;
    objectPermission: FlatObjectPermission | undefined;
    grants: DashboardAudienceObjectPermissionGrants;
  }): Promise<void> {
    const now = new Date().toISOString();

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          allFlatEntityOperationByMetadataName: {
            objectPermission: isDefined(objectPermission)
              ? {
                  flatEntityToCreate: [],
                  flatEntityToUpdate: [
                    {
                      universalIdentifier: objectPermission.universalIdentifier,
                      applicationUniversalIdentifier:
                        objectPermission.applicationUniversalIdentifier,
                      roleUniversalIdentifier:
                        objectPermission.roleUniversalIdentifier,
                      objectMetadataUniversalIdentifier:
                        objectPermission.objectMetadataUniversalIdentifier,
                      ...grants,
                      showInSidebar: objectPermission.showInSidebar,
                      editWindowMinutes: objectPermission.editWindowMinutes,
                      createdAt: objectPermission.createdAt,
                      updatedAt: now,
                    },
                  ],
                  flatEntityToDelete: [],
                }
              : {
                  flatEntityToCreate: [
                    {
                      id: v4(),
                      universalIdentifier:
                        getObjectPermissionUniversalIdentifier({
                          applicationUniversalIdentifier:
                            flatRole.applicationUniversalIdentifier,
                          roleUniversalIdentifier: flatRole.universalIdentifier,
                          objectUniversalIdentifier:
                            dashboardFlatObjectMetadata.universalIdentifier,
                        }),
                      applicationUniversalIdentifier:
                        flatRole.applicationUniversalIdentifier,
                      roleUniversalIdentifier: flatRole.universalIdentifier,
                      objectMetadataUniversalIdentifier:
                        dashboardFlatObjectMetadata.universalIdentifier,
                      ...grants,
                      showInSidebar: null,
                      editWindowMinutes: null,
                      createdAt: now,
                      updatedAt: now,
                    },
                  ],
                  flatEntityToUpdate: [],
                  flatEntityToDelete: [],
                },
          },
          workspaceId,
          isSystemBuild: false,
          applicationUniversalIdentifier:
            flatRole.applicationUniversalIdentifier,
        },
      );

    if (result.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        result,
        'Validation errors occurred while setting the dashboard object permission',
      );
    }
  }
}
