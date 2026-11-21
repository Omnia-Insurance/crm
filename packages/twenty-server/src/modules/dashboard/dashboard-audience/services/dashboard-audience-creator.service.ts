import { Injectable } from '@nestjs/common';

import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { DASHBOARD_AUDIENCE_FIELD_NAME } from 'src/modules/dashboard/dashboard-audience/constants/dashboard-audience-field-name.constant';
import { appendDashboardAudienceToken } from 'src/modules/dashboard/dashboard-audience/utils/append-dashboard-audience-token.util';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';
import { findDashboardAudienceField } from 'src/modules/dashboard/dashboard-audience/utils/find-dashboard-audience-field.util';
import { findDashboardFlatObjectMetadata } from 'src/modules/dashboard/dashboard-audience/utils/find-dashboard-flat-object-metadata.util';
import { isDashboardAudienceGatedRole } from 'src/modules/dashboard/dashboard-audience/utils/is-dashboard-audience-gated-role.util';
import { findUpsertMatchingRecordIds } from 'src/modules/omnia/utils/find-upsert-matching-record-ids.util';

@Injectable()
export class DashboardAudienceCreatorService {
  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  // The token the gated creator's audience rule requires on a new dashboard, since create follows update
  async findCreatorAudienceToken(
    authContext: WorkspaceAuthContext,
  ): Promise<string | undefined> {
    if (!isUserAuthContext(authContext)) {
      return undefined;
    }

    const {
      userWorkspaceRoleMap,
      roleIdsWithAllRecordsAccess,
      flatRoleMaps,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    } = await this.workspaceCacheService.getOrRecompute(
      authContext.workspace.id,
      [
        'userWorkspaceRoleMap',
        'roleIdsWithAllRecordsAccess',
        'flatRoleMaps',
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
      ],
    );

    const roleId = userWorkspaceRoleMap[authContext.userWorkspaceId];
    const flatRole = isDefined(roleId)
      ? findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: roleId,
          flatEntityMaps: flatRoleMaps,
        })
      : undefined;
    const dashboardFlatObjectMetadata = findDashboardFlatObjectMetadata(
      flatObjectMetadataMaps,
    );

    if (
      !isDefined(flatRole) ||
      !isDefined(dashboardFlatObjectMetadata) ||
      !isDashboardAudienceGatedRole({ flatRole, roleIdsWithAllRecordsAccess })
    ) {
      return undefined;
    }

    const audienceToken = encodeDashboardAudienceRoleToken(flatRole.id);
    const audienceFlatFieldMetadata = findDashboardAudienceField({
      dashboardObjectMetadataId: dashboardFlatObjectMetadata.id,
      flatFieldMetadataMaps,
    });

    // A value the field does not offer yet fails the insert, so it is left out until the sync adds it
    const isOffered = (audienceFlatFieldMetadata?.options ?? []).some(
      ({ value }) => value === audienceToken,
    );

    return isOffered ? audienceToken : undefined;
  }

  // For inserts that skip the dashboard create hooks, such as duplication and the AI dashboard tool
  async buildNewDashboardAudienceFields(
    authContext: WorkspaceAuthContext,
  ): Promise<Partial<Record<typeof DASHBOARD_AUDIENCE_FIELD_NAME, string[]>>> {
    const creatorAudienceToken =
      await this.findCreatorAudienceToken(authContext);

    return isDefined(creatorAudienceToken)
      ? { [DASHBOARD_AUDIENCE_FIELD_NAME]: [creatorAudienceToken] }
      : {};
  }

  // An upserted row that matches a stored dashboard updates it, so it keeps the audience other roles rely on
  async tagNewDashboards({
    authContext,
    dashboards,
    isUpsert,
  }: {
    authContext: WorkspaceAuthContext;
    dashboards: Partial<ObjectRecord>[];
    isUpsert: boolean;
  }): Promise<void> {
    const creatorAudienceToken =
      await this.findCreatorAudienceToken(authContext);

    if (!isDefined(creatorAudienceToken)) {
      return;
    }

    const newDashboards = isUpsert
      ? await this.filterDashboardsWithoutStoredMatch({
          workspaceId: authContext.workspace.id,
          dashboards,
        })
      : dashboards;

    for (const dashboard of newDashboards) {
      dashboard[DASHBOARD_AUDIENCE_FIELD_NAME] = appendDashboardAudienceToken({
        audience: dashboard[DASHBOARD_AUDIENCE_FIELD_NAME],
        audienceToken: creatorAudienceToken,
      });
    }
  }

  private async filterDashboardsWithoutStoredMatch({
    workspaceId,
    dashboards,
  }: {
    workspaceId: string;
    dashboards: Partial<ObjectRecord>[];
  }): Promise<Partial<ObjectRecord>[]> {
    const { flatObjectMetadataMaps, flatFieldMetadataMapsOrm, flatIndexMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatFieldMetadataMapsOrm',
        'flatIndexMaps',
      ]);

    const dashboardFlatObjectMetadata = findDashboardFlatObjectMetadata(
      flatObjectMetadataMaps,
    );

    if (!isDefined(dashboardFlatObjectMetadata)) {
      return dashboards;
    }

    const matchingRecordIds = await findUpsertMatchingRecordIds({
      workspaceId,
      flatObjectMetadata: dashboardFlatObjectMetadata,
      flatFieldMetadataMaps: flatFieldMetadataMapsOrm,
      flatIndexMaps,
      records: dashboards,
      workspaceOrmManager: this.workspaceOrmManager,
    });

    return dashboards.filter(
      (_dashboard, index) => !isDefined(matchingRecordIds[index]),
    );
  }
}
