import { DataSource } from 'typeorm';

import { finalizeRolePermissionFlagCutoverIfNeeded } from 'src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util';

describe('finalizeRolePermissionFlagCutoverIfNeeded', () => {
  const query = jest.fn();
  const queryRunner = new DataSource({ type: 'postgres' }).createQueryRunner();

  queryRunner.query = query;

  beforeEach(() => {
    query.mockReset();
  });

  it('only checks information_schema once the flag column is gone', async () => {
    query.mockResolvedValueOnce([]);

    const result = await finalizeRolePermissionFlagCutoverIfNeeded(queryRunner);

    expect(result).toEqual({
      wasCutoverPending: false,
      relinkedWorkspaceIds: [],
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('information_schema.columns'),
    );
  });

  it('relinks unlinked rows, then sets NOT NULL and drops the flag column in order', async () => {
    query
      .mockResolvedValueOnce([{ column_name: 'flag' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { workspaceId: 'workspace-a' },
        { workspaceId: 'workspace-b' },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await finalizeRolePermissionFlagCutoverIfNeeded(queryRunner);

    expect(result).toEqual({
      wasCutoverPending: true,
      relinkedWorkspaceIds: ['workspace-a', 'workspace-b'],
    });
    expect(query).toHaveBeenCalledTimes(7);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('information_schema.columns'),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'DROP CONSTRAINT IF EXISTS "IDX_ROLE_PERMISSION_FLAG_FLAG_ROLE_ID_UNIQUE"',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SELECT DISTINCT "workspaceId"'),
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringMatching(
        /^UPDATE "core"\."rolePermissionFlag"[\s\S]*permissionFlag\."key" = rolePermissionFlag\."flag"/,
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('GROUP BY "flag"'),
    );
    expect(query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('ALTER COLUMN "permissionFlagId" SET NOT NULL'),
    );
    expect(query).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining('DROP COLUMN IF EXISTS "flag"'),
    );
  });

  it('skips the relink when every row is already linked', async () => {
    query
      .mockResolvedValueOnce([{ column_name: 'flag' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await finalizeRolePermissionFlagCutoverIfNeeded(queryRunner);

    expect(result).toEqual({
      wasCutoverPending: true,
      relinkedWorkspaceIds: [],
    });

    const statements = query.mock.calls.map(
      ([statement]) => statement as string,
    );

    expect(statements).toHaveLength(5);
    expect(
      statements.some((statement) => statement.trim().startsWith('UPDATE')),
    ).toBe(false);
    expect(statements[3]).toContain('SET NOT NULL');
    expect(statements[4]).toContain('DROP COLUMN IF EXISTS "flag"');
  });

  it('fails before SET NOT NULL when a row matches no permission flag key', async () => {
    query
      .mockResolvedValueOnce([{ column_name: 'flag' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ workspaceId: 'workspace-a' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ flag: 'LEGACY_FLAG', count: '2' }]);

    await expect(
      finalizeRolePermissionFlagCutoverIfNeeded(queryRunner),
    ).rejects.toThrow(
      /LEGACY_FLAG: 2[\s\S]*DELETE FROM core\."upgradeMigration" WHERE name LIKE '%RolePermissionFlagCutover%' AND status = 'failed' AND "workspaceId" IS NOT NULL/,
    );

    expect(query).toHaveBeenCalledTimes(5);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET NOT NULL'),
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('DROP COLUMN'),
    );
  });
});
