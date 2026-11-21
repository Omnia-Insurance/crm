import { Test } from '@nestjs/testing';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaVerifyPermissionsUpgradeCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500009000-omnia-verify-permissions.command';
import { OmniaPermissionsVerificationService } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const WORKSPACE_ID = 'verify-permissions-workspace-id';

const VIOLATION = {
  check: 'phi-all-records-grant',
  message: 'role member-role-id reaches every policy record for update',
  ids: ['member-role-id', 'policy-object-id'],
};

describe('OmniaVerifyPermissionsUpgradeCommand', () => {
  let command: OmniaVerifyPermissionsUpgradeCommand;

  const omniaPermissionsVerificationService = { verifyWorkspace: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OmniaVerifyPermissionsUpgradeCommand,
        { provide: WorkspaceIteratorService, useValue: {} },
        {
          provide: OmniaPermissionsVerificationService,
          useValue: omniaPermissionsVerificationService,
        },
      ],
    }).compile();

    command = module.get(OmniaVerifyPermissionsUpgradeCommand);
  });

  it('should run last in the 2.58 workspace segment, after the Omnia translation and lockdown commands', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        OmniaVerifyPermissionsUpgradeCommand,
      ),
    ).toEqual({ version: '2.58.0', timestamp: 1794500009000 });
  });

  it('should pass a workspace without violations', async () => {
    omniaPermissionsVerificationService.verifyWorkspace.mockResolvedValue([]);

    await expect(
      command.runOnWorkspace({
        workspaceId: WORKSPACE_ID,
        options: {},
        index: 0,
        total: 1,
      }),
    ).resolves.toBeUndefined();

    expect(
      omniaPermissionsVerificationService.verifyWorkspace,
    ).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID });
  });

  it('should throw so the upgrade records the workspace as failed', async () => {
    omniaPermissionsVerificationService.verifyWorkspace.mockResolvedValue([
      VIOLATION,
    ]);

    await expect(
      command.runOnWorkspace({
        workspaceId: WORKSPACE_ID,
        options: {},
        index: 0,
        total: 1,
      }),
    ).rejects.toThrow(
      `Workspace ${WORKSPACE_ID}: 1 Omnia permission violation(s) in phi-all-records-grant`,
    );
  });

  it('should only report in a dry run, where earlier commands wrote nothing', async () => {
    omniaPermissionsVerificationService.verifyWorkspace.mockResolvedValue([
      VIOLATION,
    ]);

    await expect(
      command.runOnWorkspace({
        workspaceId: WORKSPACE_ID,
        options: { dryRun: true },
        index: 0,
        total: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
