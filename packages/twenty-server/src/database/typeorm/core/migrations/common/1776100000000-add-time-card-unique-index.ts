import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Adds a composite partial unique index on (agentsId, date) for every
 * workspace's `_timeCard` table. The ingestion pipeline relies on this
 * index for its insert-or-update fallback (unique_violation → update) when
 * two daily sync runs race for the same (agent, day) row.
 */
export class AddTimeCardUniqueIndex1776100000000
  implements MigrationInterface
{
  name = 'AddTimeCardUniqueIndex1776100000000';

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

      const tableName = await this.findTableName(
        queryRunner,
        schemaName,
        'timeCard',
      );

      if (!tableName) {
        continue;
      }

      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_${schemaName}_timeCard_agent_date_unique"
         ON "${schemaName}"."${tableName}" ("agentsId", "date")
         WHERE "agentsId" IS NOT NULL
           AND "date" IS NOT NULL
           AND "deletedAt" IS NULL`,
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

      await queryRunner.query(
        `DROP INDEX IF EXISTS "${schemaName}"."IDX_${schemaName}_timeCard_agent_date_unique"`,
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
