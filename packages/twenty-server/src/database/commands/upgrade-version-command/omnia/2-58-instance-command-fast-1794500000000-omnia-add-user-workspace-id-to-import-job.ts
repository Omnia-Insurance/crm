import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Every import job read and write is scoped to the member who started it.
// Rows created before this column stay NULL, so no requester can reach them.
@RegisteredInstanceCommand('2.58.0', 1794500000000)
export class OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."importJob" ADD COLUMN IF NOT EXISTS "userWorkspaceId" uuid',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."importJob" DROP COLUMN IF EXISTS "userWorkspaceId"',
    );
  }
}
