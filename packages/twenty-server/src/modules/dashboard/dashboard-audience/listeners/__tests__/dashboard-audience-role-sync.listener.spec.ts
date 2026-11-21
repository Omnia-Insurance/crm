import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { RowLevelPermissionPredicateEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity';
import { UpgradeAwareRepositoryState } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-repository-state';
import { type MetadataEvent } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/types/metadata-event.type';
import { DashboardAudienceRoleSyncListener } from 'src/modules/dashboard/dashboard-audience/listeners/dashboard-audience-role-sync.listener';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';

const WORKSPACE_ID = 'workspace-id';

const buildObjectPermissionEvent = (
  type: MetadataEvent['type'],
  rows: { before?: object; after?: object },
) =>
  ({
    type,
    metadataName: 'objectPermission',
    recordId: 'object-permission-id',
    properties: rows,
  }) as MetadataEvent;

describe('DashboardAudienceRoleSyncListener', () => {
  const syncWorkspace = jest.fn();
  const syncDashboardObjectPermissionChanges = jest.fn();
  let listener: DashboardAudienceRoleSyncListener;

  beforeEach(async () => {
    syncWorkspace.mockResolvedValue(undefined);
    syncDashboardObjectPermissionChanges.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        DashboardAudienceRoleSyncListener,
        {
          provide: DashboardAudienceRoleSyncService,
          useValue: { syncWorkspace, syncDashboardObjectPermissionChanges },
        },
      ],
    }).compile();

    listener = module.get(DashboardAudienceRoleSyncListener);
  });

  it('re-syncs the whole workspace after a role change', async () => {
    await listener.handleRoleEvent({ workspaceId: WORKSPACE_ID });

    expect(syncWorkspace).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it('hands the roles and objects of changed object permissions to the dashboard sync', async () => {
    await listener.handleObjectPermissionEvent({
      workspaceId: WORKSPACE_ID,
      events: [
        buildObjectPermissionEvent('created', {
          after: { roleId: 'member-role-id', objectMetadataId: 'dashboard-id' },
        }),
        buildObjectPermissionEvent('updated', {
          before: { roleId: 'agent-role-id', objectMetadataId: 'dashboard-id' },
          after: { roleId: 'agent-role-id', objectMetadataId: 'note-id' },
        }),
        buildObjectPermissionEvent('deleted', {
          before: {
            roleId: 'manager-role-id',
            objectMetadataId: 'dashboard-id',
          },
        }),
      ],
    });

    expect(syncDashboardObjectPermissionChanges).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      objectPermissions: [
        { roleId: 'member-role-id', objectMetadataId: 'dashboard-id' },
        { roleId: 'agent-role-id', objectMetadataId: 'dashboard-id' },
        { roleId: 'agent-role-id', objectMetadataId: 'note-id' },
        { roleId: 'manager-role-id', objectMetadataId: 'dashboard-id' },
      ],
    });
  });

  it('skips the sync when no object permission row is in the batch', async () => {
    await listener.handleObjectPermissionEvent({
      workspaceId: WORKSPACE_ID,
      events: [],
    });

    expect(syncDashboardObjectPermissionChanges).not.toHaveBeenCalled();
  });

  it('never lets a failed sync fail the role change', async () => {
    syncWorkspace.mockRejectedValue(new Error('sync failed'));

    await expect(
      listener.handleRoleEvent({ workspaceId: WORKSPACE_ID }),
    ).resolves.toBeUndefined();
  });

  describe('while an upgrade has not created the row level permission rules', () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const emitRoleAndDashboardPermissionEvents = async () => {
      await listener.handleRoleEvent({ workspaceId: WORKSPACE_ID });
      await listener.handleObjectPermissionEvent({
        workspaceId: WORKSPACE_ID,
        events: [
          buildObjectPermissionEvent('updated', {
            before: {
              roleId: 'member-role-id',
              objectMetadataId: 'dashboard-id',
            },
            after: {
              roleId: 'member-role-id',
              objectMetadataId: 'dashboard-id',
            },
          }),
        ],
      });
    };

    it('writes nothing before the rule table exists', async () => {
      jest
        .spyOn(UpgradeAwareRepositoryState.prototype, 'isEntityAvailable')
        .mockReturnValue(false);

      await emitRoleAndDashboardPermissionEvents();

      expect(syncWorkspace).not.toHaveBeenCalled();
      expect(syncDashboardObjectPermissionChanges).not.toHaveBeenCalled();
    });

    it('writes nothing while the predicates still lack their rule link', async () => {
      jest
        .spyOn(
          UpgradeAwareRepositoryState.prototype,
          'getHiddenColumnPropertyNames',
        )
        .mockImplementation((entityClass) =>
          entityClass === RowLevelPermissionPredicateEntity
            ? new Set(['rowLevelPermissionRuleId'])
            : new Set(),
        );

      await emitRoleAndDashboardPermissionEvents();

      expect(syncWorkspace).not.toHaveBeenCalled();
      expect(syncDashboardObjectPermissionChanges).not.toHaveBeenCalled();
    });
  });
});
