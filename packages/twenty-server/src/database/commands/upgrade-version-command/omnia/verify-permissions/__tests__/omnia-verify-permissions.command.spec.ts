import { Test } from '@nestjs/testing';

import {
  type WorkspaceIteratorArgs,
  WorkspaceIteratorService,
} from 'src/database/commands/command-runners/workspace-iterator.service';
import { CommandLogger } from 'src/database/commands/logger';
import { OmniaVerifyPermissionsCommand } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/omnia-verify-permissions.command';
import { OmniaPermissionsVerificationService } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service';

const WORKSPACE_ID = 'verify-permissions-workspace-id';

// Runs the callback the way the iterator does: a throw marks the workspace as failed
const iterateOverOneWorkspace = async ({ callback }: WorkspaceIteratorArgs) => {
  try {
    await callback({ workspaceId: WORKSPACE_ID, index: 0, total: 1 });

    return {
      success: [{ workspaceId: WORKSPACE_ID }],
      fail: [],
      skipped: [],
      interrupted: false,
    };
  } catch (error) {
    return {
      success: [],
      fail: [{ workspaceId: WORKSPACE_ID, error: error as Error }],
      skipped: [],
      interrupted: false,
    };
  }
};

describe('OmniaVerifyPermissionsCommand', () => {
  let command: OmniaVerifyPermissionsCommand;

  const omniaPermissionsVerificationService = { verifyWorkspace: jest.fn() };
  const workspaceIteratorService = {
    listenToShutdownSignals: jest.fn(),
    iterate: jest.fn(iterateOverOneWorkspace),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OmniaVerifyPermissionsCommand,
        {
          provide: WorkspaceIteratorService,
          useValue: workspaceIteratorService,
        },
        {
          provide: OmniaPermissionsVerificationService,
          useValue: omniaPermissionsVerificationService,
        },
      ],
    }).compile();

    command = module.get(OmniaVerifyPermissionsCommand);
  });

  it('should complete when no workspace has a violation', async () => {
    omniaPermissionsVerificationService.verifyWorkspace.mockResolvedValue([]);

    await expect(command.run([], {})).resolves.toBeUndefined();
  });

  it('should print each violation with its ids and fail the command', async () => {
    const errorSpy = jest.spyOn(CommandLogger.prototype, 'error');

    omniaPermissionsVerificationService.verifyWorkspace.mockResolvedValue([
      {
        check: 'reconciliation-lockdown',
        message:
          'role new-role-id has no object permission denying every operation on reconciliation',
        ids: ['new-role-id', 'reconciliation-object-id'],
      },
    ]);

    await expect(command.run([], {})).rejects.toThrow(
      'Command failed for 1 workspace(s)',
    );

    expect(errorSpy).toHaveBeenCalledWith(
      `Workspace ${WORKSPACE_ID}: [reconciliation-lockdown] role new-role-id has no object permission denying every operation on reconciliation (ids: new-role-id, reconciliation-object-id)`,
    );
  });
});
