import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaRestoreStandardObjectPermissionLockdownCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500008000-omnia-restore-standard-object-permission-lockdown.command';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-disabled-object-permission-actions.constant';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const RECORD_SHARE_OBJECT_ID = '20202020-0000-0000-0000-0000000000b1';

const setup = async ({
  recordShareDisabledActions,
}: {
  recordShareDisabledActions: string[] | null;
}) => {
  const query = jest.fn(async (..._args: unknown[]) => []);
  const invalidateAndRecompute = jest.fn();
  const getOrRecompute = jest.fn(async () => ({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        [STANDARD_OBJECTS.recordShare.universalIdentifier]: {
          id: RECORD_SHARE_OBJECT_ID,
          universalIdentifier: STANDARD_OBJECTS.recordShare.universalIdentifier,
          nameSingular: 'recordShare',
          disabledObjectPermissionActions: recordShareDisabledActions,
        },
        [STANDARD_OBJECTS.person.universalIdentifier]: {
          id: 'person-object-id',
          universalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
          nameSingular: 'person',
          disabledObjectPermissionActions: null,
        },
      },
    },
  }));

  const module = await Test.createTestingModule({
    providers: [
      OmniaRestoreStandardObjectPermissionLockdownCommand,
      { provide: WorkspaceIteratorService, useValue: {} },
      {
        provide: WorkspaceCacheService,
        useValue: { getOrRecompute, invalidateAndRecompute },
      },
      { provide: getDataSourceToken(), useValue: { query } },
    ],
  }).compile();

  const command = module.get(OmniaRestoreStandardObjectPermissionLockdownCommand);

  const run = (dryRun = false) =>
    command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun },
      index: 0,
      total: 1,
    });

  return { run, query, invalidateAndRecompute };
};

describe('OmniaRestoreStandardObjectPermissionLockdownCommand', () => {
  it('adds the missing record actions to recordShare only and recomputes the permission caches', async () => {
    const { run, query, invalidateAndRecompute } = await setup({
      recordShareDisabledActions: null,
    });

    await run();

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([
      WORKSPACE_ID,
      RECORD_SHARE_OBJECT_ID,
      JSON.stringify(PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS),
    ]);
    expect(invalidateAndRecompute).toHaveBeenCalledWith(WORKSPACE_ID, [
      'flatObjectMetadataMaps',
      'rolesPermissions',
    ]);
  });

  it('writes nothing on a dry run', async () => {
    const { run, query, invalidateAndRecompute } = await setup({
      recordShareDisabledActions: null,
    });

    await run(true);

    expect(query).not.toHaveBeenCalled();
    expect(invalidateAndRecompute).not.toHaveBeenCalled();
  });

  it('is a no-op once recordShare carries its lockdown', async () => {
    const { run, query, invalidateAndRecompute } = await setup({
      recordShareDisabledActions:
        PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS,
    });

    await run();

    expect(query).not.toHaveBeenCalled();
    expect(invalidateAndRecompute).not.toHaveBeenCalled();
  });
});
