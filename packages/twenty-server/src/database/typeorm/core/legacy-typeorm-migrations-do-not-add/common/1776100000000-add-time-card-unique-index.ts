import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Adds a composite partial unique index on (agent FK, date) for every
 * workspace's `_timeCard` table. The agent FK column name depends on how
 * the relation was named when the object was created in that workspace
 * (Twenty derives `{fieldName}Id`) — we probe information_schema to find
 * whichever variant actually exists and use that.
 *
 * The ingestion pipeline relies on this index for its insert-or-update
 * fallback (unique_violation → update) when concurrent sync runs race for
 * the same (agent, day) row.
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

      const agentColumn = await this.findAgentColumn(
        queryRunner,
        schemaName,
        tableName,
      );

      if (!agentColumn) {
        continue;
      }

      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_${schemaName}_timeCard_agent_date_unique"
         ON "${schemaName}"."${tableName}" ("${agentColumn}", "date")
         WHERE "${agentColumn}" IS NOT NULL
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

  // Workspaces created the Time Card object with the agent relation named
  // either `agent` (FK `agentId`) or `agents` (FK `agentsId`). Twenty
  // doesn't normalize the relation-field name, so we probe both.
  private async findAgentColumn(
    queryRunner: QueryRunner,
    schemaName: string,
    tableName: string,
  ): Promise<string | null> {
    const candidates = ['agentId', 'agentsId'];

    for (const candidate of candidates) {
      const result = await queryRunner.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = '${schemaName}'
          AND table_name = '${tableName}'
          AND column_name = '${candidate}'
        )`,
      );

      if (result[0].exists) {
        return candidate;
      }
    }

    return null;
  }
}
