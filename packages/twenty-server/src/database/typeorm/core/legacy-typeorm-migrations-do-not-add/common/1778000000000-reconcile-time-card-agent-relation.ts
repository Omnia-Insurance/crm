import { type MigrationInterface, type QueryRunner } from 'typeorm';

type WorkspaceRow = {
  id: string;
  schemaName: string | null;
};

type ExistsRow = {
  exists: boolean;
};

/**
 * Normalizes the Omnia Time Card -> Agent relation to the singular
 * `agent` field backed by the `agentId` workspace column.
 *
 * Some local workspaces drifted to `agents` / `agentsId` metadata while the
 * physical `_timeCard` table still had `agentId`, causing generated task
 * queries to select a non-existent column through TaskTarget morph relations.
 */
export class ReconcileTimeCardAgentRelation1778000000000
  implements MigrationInterface
{
  name = 'ReconcileTimeCardAgentRelation1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const workspaces: WorkspaceRow[] = await queryRunner.query(
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

      await this.ensureAgentColumn(queryRunner, schemaName, tableName);
      await this.normalizeFieldMetadata(queryRunner, workspace.id);
      await this.normalizeIngestionPipeline(queryRunner, workspace.id);
      await this.bumpMetadataVersion(queryRunner, workspace.id);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const workspaces: WorkspaceRow[] = await queryRunner.query(
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

      await this.restoreAgentsColumn(queryRunner, schemaName, tableName);
      await this.restoreFieldMetadata(queryRunner, workspace.id);
      await this.restoreIngestionPipeline(queryRunner, workspace.id);
      await this.bumpMetadataVersion(queryRunner, workspace.id);
    }
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

  private async columnExists(
    queryRunner: QueryRunner,
    schemaName: string,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const rows: ExistsRow[] = await queryRunner.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
      )`,
      [schemaName, tableName, columnName],
    );

    return rows[0]?.exists === true;
  }

  private async ensureAgentColumn(
    queryRunner: QueryRunner,
    schemaName: string,
    tableName: string,
  ): Promise<void> {
    const hasAgentId = await this.columnExists(
      queryRunner,
      schemaName,
      tableName,
      'agentId',
    );
    const hasAgentsId = await this.columnExists(
      queryRunner,
      schemaName,
      tableName,
      'agentsId',
    );

    if (!hasAgentId && hasAgentsId) {
      await queryRunner.query(
        `ALTER TABLE ${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(
          tableName,
        )}
         RENAME COLUMN "agentsId" TO "agentId"`,
      );

      return;
    }

    if (hasAgentId && hasAgentsId) {
      await queryRunner.query(
        `UPDATE ${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(
          tableName,
        )}
         SET "agentId" = "agentsId"
         WHERE "agentId" IS NULL AND "agentsId" IS NOT NULL`,
      );
    }
  }

  private async restoreAgentsColumn(
    queryRunner: QueryRunner,
    schemaName: string,
    tableName: string,
  ): Promise<void> {
    const hasAgentId = await this.columnExists(
      queryRunner,
      schemaName,
      tableName,
      'agentId',
    );
    const hasAgentsId = await this.columnExists(
      queryRunner,
      schemaName,
      tableName,
      'agentsId',
    );

    if (hasAgentId && !hasAgentsId) {
      await queryRunner.query(
        `ALTER TABLE ${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(
          tableName,
        )}
         RENAME COLUMN "agentId" TO "agentsId"`,
      );
    }
  }

  private async normalizeFieldMetadata(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE core."fieldMetadata" agent_field
       SET label = 'Agent',
           settings = jsonb_set(
             COALESCE(agent_field.settings, '{}'::jsonb),
             '{joinColumnName}',
             to_jsonb('agentId'::text),
             true
           ),
           "updatedAt" = NOW()
       FROM core."objectMetadata" object_metadata
       WHERE object_metadata.id = agent_field."objectMetadataId"
         AND object_metadata."workspaceId" = $1
         AND object_metadata."nameSingular" = 'timeCard'
         AND agent_field."workspaceId" = $1
         AND agent_field.type = 'RELATION'
         AND agent_field.name = 'agent'`,
      [workspaceId],
    );

    await queryRunner.query(
      `UPDATE core."fieldMetadata" agents_field
       SET name = 'agent',
           label = 'Agent',
           settings = jsonb_set(
             COALESCE(agents_field.settings, '{}'::jsonb),
             '{joinColumnName}',
             to_jsonb('agentId'::text),
             true
           ),
           "updatedAt" = NOW()
       FROM core."objectMetadata" object_metadata
       WHERE object_metadata.id = agents_field."objectMetadataId"
         AND object_metadata."workspaceId" = $1
         AND object_metadata."nameSingular" = 'timeCard'
         AND agents_field."workspaceId" = $1
         AND agents_field.type = 'RELATION'
         AND agents_field.name = 'agents'
         AND NOT EXISTS (
           SELECT 1
           FROM core."fieldMetadata" existing_agent_field
           WHERE existing_agent_field."objectMetadataId" =
             agents_field."objectMetadataId"
             AND existing_agent_field.name = 'agent'
         )`,
      [workspaceId],
    );
  }

  private async restoreFieldMetadata(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE core."fieldMetadata" agent_field
       SET name = 'agents',
           label = 'Agents',
           settings = jsonb_set(
             COALESCE(agent_field.settings, '{}'::jsonb),
             '{joinColumnName}',
             to_jsonb('agentsId'::text),
             true
           ),
           "updatedAt" = NOW()
       FROM core."objectMetadata" object_metadata
       WHERE object_metadata.id = agent_field."objectMetadataId"
         AND object_metadata."workspaceId" = $1
         AND object_metadata."nameSingular" = 'timeCard'
         AND agent_field."workspaceId" = $1
         AND agent_field.type = 'RELATION'
         AND agent_field.name = 'agent'
         AND NOT EXISTS (
           SELECT 1
           FROM core."fieldMetadata" existing_agents_field
           WHERE existing_agents_field."objectMetadataId" =
             agent_field."objectMetadataId"
             AND existing_agents_field.name = 'agents'
         )`,
      [workspaceId],
    );
  }

  private async normalizeIngestionPipeline(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE core."ingestionPipeline"
       SET "dedupFieldNames" =
         array_replace("dedupFieldNames", 'agentsId', 'agentId')
       WHERE "workspaceId" = $1
         AND "targetObjectNameSingular" = 'timeCard'
         AND "dedupFieldNames" IS NOT NULL
         AND 'agentsId' = ANY("dedupFieldNames")`,
      [workspaceId],
    );

    await queryRunner.query(
      `UPDATE core."ingestionFieldMapping"
       SET "targetFieldName" = 'agentId'
       WHERE "targetFieldName" = 'agentsId'
         AND "pipelineId" IN (
           SELECT id
           FROM core."ingestionPipeline"
           WHERE "workspaceId" = $1
             AND "targetObjectNameSingular" = 'timeCard'
         )`,
      [workspaceId],
    );
  }

  private async restoreIngestionPipeline(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE core."ingestionPipeline"
       SET "dedupFieldNames" =
         array_replace("dedupFieldNames", 'agentId', 'agentsId')
       WHERE "workspaceId" = $1
         AND "targetObjectNameSingular" = 'timeCard'
         AND "dedupFieldNames" IS NOT NULL
         AND 'agentId' = ANY("dedupFieldNames")`,
      [workspaceId],
    );

    await queryRunner.query(
      `UPDATE core."ingestionFieldMapping"
       SET "targetFieldName" = 'agentsId'
       WHERE "targetFieldName" = 'agentId'
         AND "pipelineId" IN (
           SELECT id
           FROM core."ingestionPipeline"
           WHERE "workspaceId" = $1
             AND "targetObjectNameSingular" = 'timeCard'
         )`,
      [workspaceId],
    );
  }

  private async bumpMetadataVersion(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE core.workspace
       SET "metadataVersion" = "metadataVersion" + 1
       WHERE id = $1`,
      [workspaceId],
    );
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.split('"').join('""')}"`;
  }
}
