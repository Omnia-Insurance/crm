import { DataSource } from 'typeorm';

import { OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-instance-command-fast-1794500000000-omnia-add-user-workspace-id-to-import-job';
import { OMNIA_ADD_USER_WORKSPACE_ID_TO_IMPORT_JOB_UPGRADE_COMMAND_NAME } from 'src/database/commands/upgrade-version-command/omnia/omnia-add-user-workspace-id-to-import-job-upgrade-command-name.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

const buildQueryRunner = () => {
  const query = jest.fn().mockResolvedValue(undefined);
  const queryRunner = new DataSource({ type: 'postgres' }).createQueryRunner();

  queryRunner.query = query;

  return { queryRunner, query };
};

describe('OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand', () => {
  const command = new OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand();

  it('runs as a fast 2.58 instance command after every upstream 2.58 instance command', () => {
    const metadata = getRegisteredInstanceCommandMetadata(
      OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand,
    );

    expect(metadata).toEqual({
      version: '2.58.0',
      timestamp: 1794500000000,
      type: 'fast',
    });
    expect(
      `${metadata?.version}_${OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand.name}_${metadata?.timestamp}`,
    ).toBe(OMNIA_ADD_USER_WORKSPACE_ID_TO_IMPORT_JOB_UPGRADE_COMMAND_NAME);
  });

  it('adds the nullable requester column idempotently, without an index or a backfill', async () => {
    const { queryRunner, query } = buildQueryRunner();

    await command.up(queryRunner);

    expect(query.mock.calls.map((call) => call[0] as string)).toEqual([
      'ALTER TABLE "core"."importJob" ADD COLUMN IF NOT EXISTS "userWorkspaceId" uuid',
    ]);
  });

  it('drops the requester column idempotently', async () => {
    const { queryRunner, query } = buildQueryRunner();

    await command.down(queryRunner);

    expect(query.mock.calls.map((call) => call[0] as string)).toEqual([
      'ALTER TABLE "core"."importJob" DROP COLUMN IF EXISTS "userWorkspaceId"',
    ]);
  });
});
