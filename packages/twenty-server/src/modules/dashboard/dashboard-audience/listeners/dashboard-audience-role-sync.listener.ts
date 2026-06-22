import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { type MetadataEventBatch } from 'src/engine/subscriptions/metadata-event/types/metadata-event-batch.type';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';

/**
 * OMNIA-CUSTOM: keeps dashboard audience gating in lockstep with roles.
 * Role create/update/delete all emit `metadata.role.*` events (role is in the
 * metadata emit allowlist); on any of them we re-sync the workspace's dashboard
 * `audience` field options + per-role row-level predicates. Role deletes also
 * cascade-delete their predicates at the DB level, so the re-sync only needs to
 * drop the stale option.
 */
@Injectable()
export class DashboardAudienceRoleSyncListener {
  private readonly logger = new Logger(DashboardAudienceRoleSyncListener.name);

  constructor(
    private readonly dashboardAudienceRoleSyncService: DashboardAudienceRoleSyncService,
  ) {}

  @OnEvent('metadata.role.created')
  async onRoleCreated(
    batch: MetadataEventBatch<'role', 'created'>,
  ): Promise<void> {
    await this.safeSync(batch.workspaceId);
  }

  @OnEvent('metadata.role.updated')
  async onRoleUpdated(
    batch: MetadataEventBatch<'role', 'updated'>,
  ): Promise<void> {
    await this.safeSync(batch.workspaceId);
  }

  @OnEvent('metadata.role.deleted')
  async onRoleDeleted(
    batch: MetadataEventBatch<'role', 'deleted'>,
  ): Promise<void> {
    await this.safeSync(batch.workspaceId);
  }

  private async safeSync(workspaceId: string): Promise<void> {
    try {
      await this.dashboardAudienceRoleSyncService.syncWorkspace(workspaceId);
    } catch (error) {
      // Never let a sync failure bubble into the role mutation flow.
      this.logger.error(
        `Failed to sync dashboard audience after a role change in workspace ${workspaceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
