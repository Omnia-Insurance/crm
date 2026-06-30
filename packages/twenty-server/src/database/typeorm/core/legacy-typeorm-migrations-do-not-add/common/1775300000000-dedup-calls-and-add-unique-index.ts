import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class DedupCallsAndAddUniqueIndex1775300000000
  implements MigrationInterface
{
  name = 'DedupCallsAndAddUniqueIndex1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const workspaces = await queryRunner.query(
      `SELECT w.id, ds.schema as "schemaName"
       FROM core.workspace w
       JOIN core."dataSource" ds ON ds."workspaceId" = w.id
       WHERE w."deletedAt" IS NULL AND ds."isRemote" = false`,
    );

    for (const workspace of workspaces) {
      const schemaName = workspace.schemaName;

      if (!schemaName) {
        continue;
      }

      const callTable = await this.findTableName(
        queryRunner,
        schemaName,
        'call',
      );

      if (!callTable) {
        continue;
      }

      const qualifiedTable = `"${schemaName}"."${callTable}"`;

      // Step 1: Delete duplicate call records, keeping the "best" one per convosoCallId.
      // Best = prefer non-null duration, longest duration, most recent updatedAt.
      // This uses a window function to rank duplicates and deletes all but rank 1.
      await queryRunner.query(
        `DELETE FROM ${qualifiedTable}
         WHERE id IN (
           SELECT id FROM (
             SELECT
               id,
               ROW_NUMBER() OVER (
                 PARTITION BY "convosoCallId"
                 ORDER BY
                   CASE WHEN duration IS NOT NULL AND duration > 0 THEN 0 ELSE 1 END,
                   COALESCE(duration, 0) DESC,
                   "updatedAt" DESC
               ) AS rn
             FROM ${qualifiedTable}
             WHERE "convosoCallId" IS NOT NULL
               AND "deletedAt" IS NULL
           ) ranked
           WHERE rn > 1
         )`,
      );

      // Step 2: Also handle soft-deleted duplicates — keep at most one per convosoCallId
      // among deleted records too, so the unique index doesn't conflict.
      // Actually, our index will filter on deletedAt IS NULL, so soft-deleted rows are fine.

      // Step 3: Add unique partial index on convosoCallId for non-deleted records
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_${schemaName}_call_convosoCallId_unique"
         ON ${qualifiedTable} ("convosoCallId")
         WHERE "convosoCallId" IS NOT NULL AND "deletedAt" IS NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const workspaces = await queryRunner.query(
      `SELECT w.id, ds.schema as "schemaName"
       FROM core.workspace w
       JOIN core."dataSource" ds ON ds."workspaceId" = w.id
       WHERE w."deletedAt" IS NULL AND ds."isRemote" = false`,
    );

    for (const workspace of workspaces) {
      const schemaName = workspace.schemaName;

      if (!schemaName) {
        continue;
      }

      // Drop the unique index
      await queryRunner.query(
        `DROP INDEX IF EXISTS "${schemaName}"."IDX_${schemaName}_call_convosoCallId_unique"`,
      );
    }
  }

  private async findTableName(
    queryRunner: QueryRunner,
    schemaName: string,
    baseName: string,
  ): Promise<string | null> {
    const prefixed = await queryRunner.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = '${schemaName}'
        AND table_name = '_${baseName}'
      )`,
    );

    if (prefixed[0].exists) {
      return `_${baseName}`;
    }

    const unprefixed = await queryRunner.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = '${schemaName}'
        AND table_name = '${baseName}'
      )`,
    );

    if (unprefixed[0].exists) {
      return baseName;
    }

    return null;
  }
}
