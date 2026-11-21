import { Logger } from '@nestjs/common';

import { type QueryRunner } from 'typeorm';

import { finalizeRolePermissionFlagCutoverIfNeeded } from 'src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util';
import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

// Upstream added the 2.7 Finalize command after prod's upgrade cursor had
// already passed it, so `upgrade` never runs it there. Sorts first in 2.8.
@RegisteredInstanceCommand('2.8.0', 1798100000000)
export class OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand implements FastInstanceCommand {
  private readonly logger = new Logger(
    OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand.name,
  );

  constructor(private readonly workspaceCacheService: WorkspaceCacheService) {}

  public async up(queryRunner: QueryRunner): Promise<void> {
    const { wasCutoverPending, relinkedWorkspaceIds } =
      await finalizeRolePermissionFlagCutoverIfNeeded(queryRunner);

    if (!wasCutoverPending) {
      return;
    }

    for (const workspaceId of relinkedWorkspaceIds) {
      await this.workspaceCacheService.flush(workspaceId, [
        'flatRolePermissionFlagMaps',
      ]);
    }

    this.logger.log(
      `Finalized the rolePermissionFlag cutover; relinked rows in ${relinkedWorkspaceIds.length} workspace(s)`,
    );
  }

  // Finalize's down owns restoring "flag"; running both downs would add its
  // unique constraint twice.
  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
