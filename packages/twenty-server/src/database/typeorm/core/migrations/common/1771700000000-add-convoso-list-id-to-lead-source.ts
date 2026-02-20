import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddConvosoListIdToLeadSource1771700000000
  implements MigrationInterface
{
  name = 'AddConvosoListIdToLeadSource1771700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Get all active workspaces with their schema names
    const workspaces = await queryRunner.query(
      `SELECT w.id, w."workspaceCustomApplicationId", ds.schema as "schemaName"
       FROM core.workspace w
       JOIN core."dataSource" ds ON ds."workspaceId" = w.id
       WHERE w."deletedAt" IS NULL AND ds."isRemote" = false`,
    );

    for (const workspace of workspaces) {
      const schemaName = workspace.schemaName;

      if (!schemaName) {
        continue;
      }

      // 2. Find the leadSource table (check _leadSource and leadSource)
      const leadSourceTable = await this.findTableName(
        queryRunner,
        schemaName,
        'leadSource',
      );

      if (!leadSourceTable) {
        continue;
      }

      // 3. Add convosoListId text column (IF NOT EXISTS)
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."${leadSourceTable}"
         ADD COLUMN IF NOT EXISTS "convosoListId" text`,
      );

      // 4. Add field metadata entry for convosoListId (idempotent)
      await this.addFieldMetadata(queryRunner, workspace);

      // 5. Backfill from hardcoded Convoso list mapping
      await queryRunner.query(
        `UPDATE "${schemaName}"."${leadSourceTable}" SET "convosoListId" = mapping.list_id
         FROM (VALUES
           ('10129', 'Default List:Omnia Insurance G'),
           ('10133', 'Unlisted Inbound Callers'),
           ('10135', 'Agent Created Leads'),
           ('10137', 'API Inserted Leads'),
           ('10145', 'TEST LEADS'),
           ('10269', 'OIG Upload AOR BOB 07082025'),
           ('10295', 'Dental BOB 7.13.25'),
           ('10297', 'OIG Upload AOR BOB 07142025'),
           ('10361', 'AWL Dental Live Transfers'),
           ('10363', 'General TFN - Google'),
           ('10373', 'OIG Upload DMS 07182025'),
           ('10391', 'Slate U65 Leads'),
           ('10429', 'RateQuote U65 Search'),
           ('10431', 'Intuit U65 Inbounds'),
           ('10781', 'AWL Dental Non-Sale Callbacks'),
           ('10855', 'OIG Upload DMS 09222025'),
           ('10857', 'Google STMHI TX'),
           ('10859', 'Google STMHI FL'),
           ('10861', 'Google STMHI National'),
           ('10863', 'Google ACA National'),
           ('10865', 'Google ACA FL'),
           ('10867', 'Google ACA TX'),
           ('11655', 'Benepath U65 Income'),
           ('11753', 'Test List to review'),
           ('11755', 'Sold ACA for Auto Conversion'),
           ('11757', 'Retention List')
         ) AS mapping(list_id, list_name)
         WHERE "${schemaName}"."${leadSourceTable}".name = mapping.list_name
           AND "${schemaName}"."${leadSourceTable}"."convosoListId" IS NULL`,
      );

      // 6. Bump metadata version
      await queryRunner.query(
        `UPDATE core.workspace
         SET "metadataVersion" = "metadataVersion" + 1
         WHERE id = '${workspace.id}'`,
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

      const leadSourceTable = await this.findTableName(
        queryRunner,
        schemaName,
        'leadSource',
      );

      if (!leadSourceTable) {
        continue;
      }

      // 1. Drop the convosoListId column
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."${leadSourceTable}"
         DROP COLUMN IF EXISTS "convosoListId"`,
      );

      // 2. Remove the field metadata entry
      const objectMetadata = await queryRunner.query(
        `SELECT id FROM core."objectMetadata"
         WHERE "workspaceId" = '${workspace.id}'
           AND "nameSingular" = 'leadSource'`,
      );

      if (objectMetadata.length > 0) {
        await queryRunner.query(
          `DELETE FROM core."fieldMetadata"
           WHERE "objectMetadataId" = '${objectMetadata[0].id}'
             AND name = 'convosoListId'
             AND "workspaceId" = '${workspace.id}'`,
        );
      }

      // 3. Bump metadata version
      await queryRunner.query(
        `UPDATE core.workspace
         SET "metadataVersion" = "metadataVersion" + 1
         WHERE id = '${workspace.id}'`,
      );
    }
  }

  private async findTableName(
    queryRunner: QueryRunner,
    schemaName: string,
    baseName: string,
  ): Promise<string | null> {
    // Check for underscore-prefixed table first (newer convention)
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

    // Fall back to non-prefixed table
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

  private async addFieldMetadata(
    queryRunner: QueryRunner,
    workspace: { id: string; workspaceCustomApplicationId: string | null },
  ): Promise<void> {
    const objectMetadata = await queryRunner.query(
      `SELECT id FROM core."objectMetadata"
       WHERE "workspaceId" = '${workspace.id}'
         AND "nameSingular" = 'leadSource'`,
    );

    if (objectMetadata.length === 0) {
      return;
    }

    const objectMetadataId = objectMetadata[0].id;

    // Check if field already exists
    const existing = await queryRunner.query(
      `SELECT id FROM core."fieldMetadata"
       WHERE "objectMetadataId" = '${objectMetadataId}'
         AND name = 'convosoListId'
         AND "workspaceId" = '${workspace.id}'`,
    );

    if (existing.length > 0) {
      return;
    }

    const appId = workspace.workspaceCustomApplicationId || null;
    const appIdClause = appId ? `'${appId}'` : 'NULL';

    await queryRunner.query(
      `INSERT INTO core."fieldMetadata" (
        id,
        "objectMetadataId",
        type,
        name,
        label,
        "defaultValue",
        description,
        icon,
        "isCustom",
        "isActive",
        "isSystem",
        "isNullable",
        "isUnique",
        "isLabelSyncedWithName",
        "workspaceId",
        "universalIdentifier",
        "applicationId",
        "createdAt",
        "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        '${objectMetadataId}',
        'TEXT',
        'convosoListId',
        'Convoso List ID',
        NULL,
        'Convoso list_id for matching leads to their source',
        'IconList',
        true,
        true,
        false,
        true,
        false,
        false,
        '${workspace.id}',
        gen_random_uuid(),
        ${appIdClause},
        NOW(),
        NOW()
      )`,
    );
  }
}
