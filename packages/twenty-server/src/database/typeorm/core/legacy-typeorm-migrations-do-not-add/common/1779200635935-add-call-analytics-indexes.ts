import { type MigrationInterface, type QueryRunner } from 'typeorm';

type WorkspaceRow = {
  schemaName: string | null;
};

type ExistsRow = {
  exists: boolean;
};

type IndexValidityRow = {
  isValid: boolean;
};

const CALL_ANALYTICS_INDEX_NAMES = [
  'idx_call_live_billable_date_agent_cover',
  'idx_call_live_inbound_date_agent_cover',
  'idx_call_live_lead_priority_date_cover',
] as const;

// Adds Omnia call analytics indexes for high-cardinality all-time aggregates
// used by the Command analytics overview and CPA explorer.
export class AddCallAnalyticsIndexes1779200635935
  implements MigrationInterface
{
  name = 'AddCallAnalyticsIndexes1779200635935';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const workspaces: WorkspaceRow[] = await queryRunner.query(
      `SELECT ds.schema as "schemaName"
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

      const hasOverviewColumns = await this.columnsExist(
        queryRunner,
        schemaName,
        callTable,
        [
          'agentId',
          'billable',
          'callDate',
          'costAmountMicros',
          'deletedAt',
          'direction',
          'leadId',
          'leadSourceId',
          'queueName',
        ],
      );

      if (hasOverviewColumns) {
        await this.createBillableCallIndex(queryRunner, schemaName, callTable);
        await this.createInboundCallIndex(queryRunner, schemaName, callTable);
      }

      const hasLeadPriorityColumns = await this.columnsExist(
        queryRunner,
        schemaName,
        callTable,
        [
          'billable',
          'callDate',
          'deletedAt',
          'direction',
          'leadId',
          'leadSourceId',
          'queueName',
        ],
      );

      if (hasLeadPriorityColumns) {
        await this.createLeadPriorityCallIndex(
          queryRunner,
          schemaName,
          callTable,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const workspaces: WorkspaceRow[] = await queryRunner.query(
      `SELECT ds.schema as "schemaName"
       FROM core.workspace w
       JOIN core."dataSource" ds ON ds."workspaceId" = w.id
       WHERE w."deletedAt" IS NULL AND ds."isRemote" = false`,
    );

    for (const workspace of workspaces) {
      const schemaName = workspace.schemaName;

      if (!schemaName) {
        continue;
      }

      for (const indexName of CALL_ANALYTICS_INDEX_NAMES) {
        await queryRunner.query(
          `DROP INDEX CONCURRENTLY IF EXISTS ${this.quoteIdentifier(
            schemaName,
          )}.${this.quoteIdentifier(indexName)}`,
        );
      }
    }
  }

  private async createBillableCallIndex(
    queryRunner: QueryRunner,
    schemaName: string,
    callTable: string,
  ): Promise<void> {
    await this.dropInvalidIndexIfExists(
      queryRunner,
      schemaName,
      CALL_ANALYTICS_INDEX_NAMES[0],
    );

    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${this.quoteIdentifier(
        CALL_ANALYTICS_INDEX_NAMES[0],
      )}
       ON ${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(
         callTable,
       )} ("callDate", "agentId")
       INCLUDE (direction, "costAmountMicros", "leadId", "leadSourceId", "queueName")
       WHERE "deletedAt" IS NULL AND billable IS TRUE`,
    );
  }

  private async createInboundCallIndex(
    queryRunner: QueryRunner,
    schemaName: string,
    callTable: string,
  ): Promise<void> {
    await this.dropInvalidIndexIfExists(
      queryRunner,
      schemaName,
      CALL_ANALYTICS_INDEX_NAMES[1],
    );

    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${this.quoteIdentifier(
        CALL_ANALYTICS_INDEX_NAMES[1],
      )}
       ON ${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(
         callTable,
       )} ("callDate", "agentId")
       INCLUDE (billable, "costAmountMicros", "leadId", "leadSourceId", "queueName")
       WHERE "deletedAt" IS NULL AND direction = 'INBOUND'`,
    );
  }

  private async createLeadPriorityCallIndex(
    queryRunner: QueryRunner,
    schemaName: string,
    callTable: string,
  ): Promise<void> {
    await this.dropInvalidIndexIfExists(
      queryRunner,
      schemaName,
      CALL_ANALYTICS_INDEX_NAMES[2],
    );

    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${this.quoteIdentifier(
        CALL_ANALYTICS_INDEX_NAMES[2],
      )}
       ON ${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(
         callTable,
       )} (
         "leadId",
         (CASE
           WHEN direction = 'INBOUND' AND billable THEN 1
           WHEN direction = 'INBOUND' THEN 2
           WHEN direction = 'OUTBOUND' THEN 3
           ELSE 4
         END),
         "callDate" DESC
       )
       INCLUDE ("leadSourceId", "queueName")
       WHERE "deletedAt" IS NULL AND "leadId" IS NOT NULL`,
    );
  }

  private async findTableName(
    queryRunner: QueryRunner,
    schemaName: string,
    baseName: string,
  ): Promise<string | null> {
    const prefixedTableName = `_${baseName}`;

    if (await this.tableExists(queryRunner, schemaName, prefixedTableName)) {
      return prefixedTableName;
    }

    if (await this.tableExists(queryRunner, schemaName, baseName)) {
      return baseName;
    }

    return null;
  }

  private async tableExists(
    queryRunner: QueryRunner,
    schemaName: string,
    tableName: string,
  ): Promise<boolean> {
    const rows: ExistsRow[] = await queryRunner.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = $1
        AND table_name = $2
      )`,
      [schemaName, tableName],
    );

    return rows[0]?.exists === true;
  }

  private async columnsExist(
    queryRunner: QueryRunner,
    schemaName: string,
    tableName: string,
    columnNames: string[],
  ): Promise<boolean> {
    const rows: ExistsRow[] = await queryRunner.query(
      `SELECT NOT EXISTS (
        SELECT 1
        FROM unnest($3::text[]) AS required_column(column_name)
        WHERE NOT EXISTS (
          SELECT 1
          FROM information_schema.columns AS actual_column
          WHERE actual_column.table_schema = $1
          AND actual_column.table_name = $2
          AND actual_column.column_name = required_column.column_name
        )
      ) AS exists`,
      [schemaName, tableName, columnNames],
    );

    return rows[0]?.exists === true;
  }

  private async dropInvalidIndexIfExists(
    queryRunner: QueryRunner,
    schemaName: string,
    indexName: string,
  ): Promise<void> {
    const rows: IndexValidityRow[] = await queryRunner.query(
      `SELECT pg_index.indisvalid AS "isValid"
       FROM pg_class index_class
       JOIN pg_namespace index_namespace
         ON index_namespace.oid = index_class.relnamespace
       JOIN pg_index ON pg_index.indexrelid = index_class.oid
       WHERE index_namespace.nspname = $1
         AND index_class.relname = $2`,
      [schemaName, indexName],
    );

    if (rows[0]?.isValid === false) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS ${this.quoteIdentifier(
          schemaName,
        )}.${this.quoteIdentifier(indexName)}`,
      );
    }
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
