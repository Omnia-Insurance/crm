import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { type MetadataEventBatch } from 'src/engine/subscriptions/metadata-event/types/metadata-event-batch.type';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';
import { findObjectPermissionEventRoleAndObjectIds } from 'src/modules/dashboard/dashboard-audience/utils/find-object-permission-event-role-and-object-ids.util';
import { isRowLevelPermissionRuleSchemaAvailable } from 'src/modules/omnia/utils/is-row-level-permission-rule-schema-available.util';

@Injectable()
export class DashboardAudienceRoleSyncListener {
  private readonly logger = new Logger(DashboardAudienceRoleSyncListener.name);

  constructor(
    private readonly dashboardAudienceRoleSyncService: DashboardAudienceRoleSyncService,
  ) {}

  @OnEvent('metadata.role.created')
  @OnEvent('metadata.role.updated')
  @OnEvent('metadata.role.deleted')
  async handleRoleEvent({
    workspaceId,
  }: Pick<MetadataEventBatch, 'workspaceId'>): Promise<void> {
    await this.syncSafely(workspaceId, () =>
      this.dashboardAudienceRoleSyncService.syncWorkspace(workspaceId),
    );
  }

  // Saving role settings replaces all of the role's object permissions, which can reopen every dashboard
  @OnEvent('metadata.objectPermission.created')
  @OnEvent('metadata.objectPermission.updated')
  @OnEvent('metadata.objectPermission.deleted')
  async handleObjectPermissionEvent({
    workspaceId,
    events,
  }: Pick<MetadataEventBatch, 'workspaceId' | 'events'>): Promise<void> {
    const objectPermissions = findObjectPermissionEventRoleAndObjectIds(events);

    if (objectPermissions.length === 0) {
      return;
    }

    await this.syncSafely(workspaceId, () =>
      this.dashboardAudienceRoleSyncService.syncDashboardObjectPermissionChanges(
        { workspaceId, objectPermissions },
      ),
    );
  }

  // A failed sync must not fail the role change that triggered it; the next event or command retries it
  private async syncSafely(
    workspaceId: string,
    sync: () => Promise<void>,
  ): Promise<void> {
    // Earlier upgrade steps emit role events before the rules exist; the 2.58 dashboard audience
    // upgrade command syncs every role once they do
    if (!isRowLevelPermissionRuleSchemaAvailable()) {
      this.logger.log(
        `Dashboard audience sync skipped in workspace ${workspaceId}: the upgrade has not created the row level permission rules yet`,
      );

      return;
    }

    try {
      await sync();
    } catch (error) {
      this.logger.error(
        `Dashboard audience sync failed in workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
