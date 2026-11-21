import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type MetadataEventBatch } from 'src/engine/subscriptions/metadata-event/types/metadata-event-batch.type';
import { type MetadataEvent } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/types/metadata-event.type';
import { isRowLevelPermissionRuleSchemaAvailable } from 'src/modules/omnia/utils/is-row-level-permission-rule-schema-available.util';
import { ReconciliationObjectLockdownService } from 'src/modules/reconciliation/services/object-lockdown.service';

type EventRecordReference = {
  roleId: string;
  objectMetadataId: string | undefined;
};

const getEventRecords = (event: MetadataEvent): object[] => {
  switch (event.type) {
    case 'created':
      return [event.properties.after];
    case 'updated':
      return [event.properties.before, event.properties.after];
    case 'deleted':
      return [event.properties.before];
  }
};

const getEventRecordReferences = (
  event: MetadataEvent,
): EventRecordReference[] =>
  getEventRecords(event).flatMap((record) =>
    'roleId' in record && isNonEmptyString(record.roleId)
      ? [
          {
            roleId: record.roleId,
            objectMetadataId:
              'objectMetadataId' in record &&
              isNonEmptyString(record.objectMetadataId)
                ? record.objectMetadataId
                : undefined,
          },
        ]
      : [],
  );

// The settings role flow creates a role, then full-replaces its object permissions without the deny
// rows; app syncs rebuild app and grant roles the same way. Re-locking after each change closes both.
@Injectable()
export class ReconciliationObjectLockdownListener {
  private readonly logger = new Logger(
    ReconciliationObjectLockdownListener.name,
  );

  constructor(
    private readonly reconciliationObjectLockdownService: ReconciliationObjectLockdownService,
  ) {}

  @OnEvent('metadata.role.created')
  async handleRoleCreated({
    workspaceId,
    events,
  }: MetadataEventBatch<'role', 'created'>): Promise<void> {
    await this.lockRoles({
      workspaceId,
      roleIds: events.map(({ recordId }) => recordId),
    });
  }

  @OnEvent('metadata.objectPermission.created')
  @OnEvent('metadata.objectPermission.updated')
  @OnEvent('metadata.objectPermission.deleted')
  async handleObjectPermissionChange({
    workspaceId,
    events,
  }: MetadataEventBatch<'objectPermission'>): Promise<void> {
    await this.lockRoles({
      workspaceId,
      roleIds: events
        .flatMap(getEventRecordReferences)
        .map(({ roleId }) => roleId),
    });
  }

  @OnEvent('metadata.rowLevelPermissionRule.created')
  @OnEvent('metadata.rowLevelPermissionRule.updated')
  @OnEvent('metadata.rowLevelPermissionPredicate.created')
  async handleRowLevelPermissionChange({
    workspaceId,
    events,
  }: MetadataEventBatch<
    'rowLevelPermissionRule' | 'rowLevelPermissionPredicate'
  >): Promise<void> {
    if (this.isDeferredToUpgrade(workspaceId)) {
      return;
    }

    try {
      const reconciliationObjectMetadataIds =
        await this.reconciliationObjectLockdownService.findReconciliationObjectMetadataIds(
          workspaceId,
        );

      await this.lockRoles({
        workspaceId,
        roleIds: events
          .flatMap(getEventRecordReferences)
          .filter(
            ({ objectMetadataId }) =>
              isNonEmptyString(objectMetadataId) &&
              reconciliationObjectMetadataIds.has(objectMetadataId),
          )
          .map(({ roleId }) => roleId),
      });
    } catch (error) {
      this.logLockFailure({ workspaceId, error });
    }
  }

  private async lockRoles({
    workspaceId,
    roleIds,
  }: {
    workspaceId: string;
    roleIds: string[];
  }): Promise<void> {
    if (this.isDeferredToUpgrade(workspaceId)) {
      return;
    }

    for (const roleId of new Set(roleIds)) {
      try {
        await this.reconciliationObjectLockdownService.applyToRole({
          workspaceId,
          roleId,
        });
      } catch (error) {
        // The upgrade verify and workspace:omnia-verify-permissions report a role left unlocked
        this.logLockFailure({ workspaceId, roleId, error });
      }
    }
  }

  // Earlier upgrade steps create roles, the 2.57 grant roles among them, before the rules exist; the 2.58
  // lockdown command locks every role once they do, and the upgrade's permission verification checks it
  private isDeferredToUpgrade(workspaceId: string): boolean {
    if (isRowLevelPermissionRuleSchemaAvailable()) {
      return false;
    }

    this.logger.log(
      `Reconciliation lockdown skipped in workspace ${workspaceId}: the upgrade has not created the row level permission rules yet`,
    );

    return true;
  }

  private logLockFailure({
    workspaceId,
    roleId,
    error,
  }: {
    workspaceId: string;
    roleId?: string;
    error: unknown;
  }): void {
    this.logger.error(
      `Could not lock the reconciliation objects for ${isDefined(roleId) ? `role ${roleId}` : 'a role'} in workspace ${workspaceId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
