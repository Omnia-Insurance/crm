import { Test } from '@nestjs/testing';

import { DataSource } from 'typeorm';

import { finalizeRolePermissionFlagCutoverIfNeeded } from 'src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util';
import { OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand } from 'src/database/commands/upgrade-version-command/omnia/2-8-instance-command-fast-1798100000000-omnia-finalize-role-permission-flag-cutover-catch-up';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

jest.mock(
  'src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util',
);

describe('OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand', () => {
  const queryRunner = new DataSource({ type: 'postgres' }).createQueryRunner();
  const flush = jest.fn();

  let command: OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand,
        { provide: WorkspaceCacheService, useValue: { flush } },
      ],
    }).compile();

    command = module.get(
      OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand,
    );
  });

  it('flushes the role permission flag cache of every relinked workspace', async () => {
    jest.mocked(finalizeRolePermissionFlagCutoverIfNeeded).mockResolvedValue({
      wasCutoverPending: true,
      relinkedWorkspaceIds: ['workspace-a', 'workspace-b'],
    });

    await command.up(queryRunner);

    expect(finalizeRolePermissionFlagCutoverIfNeeded).toHaveBeenCalledWith(
      queryRunner,
    );
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalledWith('workspace-a', [
      'flatRolePermissionFlagMaps',
    ]);
    expect(flush).toHaveBeenCalledWith('workspace-b', [
      'flatRolePermissionFlagMaps',
    ]);
  });

  it('touches no cache when the cutover was already finalized', async () => {
    jest.mocked(finalizeRolePermissionFlagCutoverIfNeeded).mockResolvedValue({
      wasCutoverPending: false,
      relinkedWorkspaceIds: [],
    });

    await command.up(queryRunner);

    expect(flush).not.toHaveBeenCalled();
  });
});
