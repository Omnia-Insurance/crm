import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddCallRecordingUrl1771700000000 implements MigrationInterface {
  name = 'AddCallRecordingUrl1771700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

      // Part A: Create recording LINKS field on Call object
      await this.addRecordingField(queryRunner, workspace);

      // Part B: Enable recordings in Convoso Call pipeline config
      await this.enableRecordingsInPipeline(queryRunner, workspace.id);

      // Part C: Add field mappings for recording URL
      await this.addRecordingFieldMappings(queryRunner, workspace.id);

      // Bump metadata version
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

      // Reverse Part C: Remove recording field mappings
      await queryRunner.query(
        `DELETE FROM core."ingestionFieldMapping"
         WHERE "sourceFieldPath" = 'recording[0].public_url'
           AND "targetFieldName" = 'recording'
           AND "pipelineId" IN (
             SELECT id FROM core."ingestionPipeline"
             WHERE "workspaceId" = '${workspace.id}'
               AND name LIKE '%Convoso Call%'
           )`,
      );

      // Reverse Part B: Disable recordings in pipeline config
      await queryRunner.query(
        `UPDATE core."ingestionPipeline"
         SET "sourceRequestConfig" = jsonb_set(
           "sourceRequestConfig",
           '{queryParams,include_recordings}',
           '"0"'
         )
         WHERE "workspaceId" = '${workspace.id}'
           AND name LIKE '%Convoso Call%'
           AND "sourceRequestConfig"->'queryParams'->>'include_recordings' = '1'`,
      );

      // Reverse Part A: Remove recording field and columns
      const callTable = await this.findTableName(
        queryRunner,
        schemaName,
        'call',
      );

      if (callTable) {
        await queryRunner.query(
          `ALTER TABLE "${schemaName}"."${callTable}"
           DROP COLUMN IF EXISTS "recordingPrimaryLinkLabel"`,
        );
        await queryRunner.query(
          `ALTER TABLE "${schemaName}"."${callTable}"
           DROP COLUMN IF EXISTS "recordingPrimaryLinkUrl"`,
        );
        await queryRunner.query(
          `ALTER TABLE "${schemaName}"."${callTable}"
           DROP COLUMN IF EXISTS "recordingSecondaryLinks"`,
        );
      }

      // Remove field metadata
      const objectMetadata = await queryRunner.query(
        `SELECT id FROM core."objectMetadata"
         WHERE "workspaceId" = '${workspace.id}'
           AND "nameSingular" = 'call'`,
      );

      if (objectMetadata.length > 0) {
        await queryRunner.query(
          `DELETE FROM core."fieldMetadata"
           WHERE "objectMetadataId" = '${objectMetadata[0].id}'
             AND name = 'recording'
             AND "workspaceId" = '${workspace.id}'`,
        );
      }

      // Bump metadata version
      await queryRunner.query(
        `UPDATE core.workspace
         SET "metadataVersion" = "metadataVersion" + 1
         WHERE id = '${workspace.id}'`,
      );
    }
  }

  private async addRecordingField(
    queryRunner: QueryRunner,
    workspace: { id: string; workspaceCustomApplicationId: string | null },
  ): Promise<void> {
    const schemaName = (
      await queryRunner.query(
        `SELECT schema FROM core."dataSource"
       WHERE "workspaceId" = '${workspace.id}' AND "isRemote" = false`,
      )
    )[0]?.schema;

    if (!schemaName) {
      return;
    }

    const objectMetadata = await queryRunner.query(
      `SELECT id FROM core."objectMetadata"
       WHERE "workspaceId" = '${workspace.id}'
         AND "nameSingular" = 'call'`,
    );

    if (objectMetadata.length === 0) {
      return;
    }

    const objectMetadataId = objectMetadata[0].id;

    // Check if field already exists
    const existing = await queryRunner.query(
      `SELECT id FROM core."fieldMetadata"
       WHERE "objectMetadataId" = '${objectMetadataId}'
         AND name = 'recording'
         AND "workspaceId" = '${workspace.id}'`,
    );

    if (existing.length > 0) {
      return;
    }

    const appId = workspace.workspaceCustomApplicationId || null;
    const appIdClause = appId ? `'${appId}'` : 'NULL';

    // Insert field metadata
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
        'LINKS',
        'recording',
        'Recording',
        '{"primaryLinkLabel": "''", "primaryLinkUrl": "''", "secondaryLinks": null}',
        'Link to the call recording in Convoso',
        'IconPlayerPlay',
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

    // Add composite columns to workspace call table
    const callTable = await this.findTableName(queryRunner, schemaName, 'call');

    if (callTable) {
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."${callTable}"
         ADD COLUMN IF NOT EXISTS "recordingPrimaryLinkLabel" text DEFAULT ''`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."${callTable}"
         ADD COLUMN IF NOT EXISTS "recordingPrimaryLinkUrl" text DEFAULT ''`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."${callTable}"
         ADD COLUMN IF NOT EXISTS "recordingSecondaryLinks" jsonb DEFAULT NULL`,
      );
    }
  }

  private async enableRecordingsInPipeline(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE core."ingestionPipeline"
       SET "sourceRequestConfig" = jsonb_set(
         "sourceRequestConfig",
         '{queryParams,include_recordings}',
         '"1"'
       )
       WHERE "workspaceId" = '${workspaceId}'
         AND name LIKE '%Convoso Call%'
         AND "sourceRequestConfig"->'queryParams'->>'include_recordings' = '0'`,
    );
  }

  private async addRecordingFieldMappings(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    const pipelines = await queryRunner.query(
      `SELECT id FROM core."ingestionPipeline"
       WHERE "workspaceId" = '${workspaceId}'
         AND name LIKE '%Convoso Call%'
         AND "deletedAt" IS NULL`,
    );

    if (pipelines.length === 0) {
      return;
    }

    const pipelineId = pipelines[0].id;

    // Check if mappings already exist
    const existing = await queryRunner.query(
      `SELECT id FROM core."ingestionFieldMapping"
       WHERE "pipelineId" = '${pipelineId}'
         AND "sourceFieldPath" = 'recording[0].public_url'
         AND "targetFieldName" = 'recording'`,
    );

    if (existing.length > 0) {
      return;
    }

    // Mapping 1: recording[0].public_url -> recording.primaryLinkUrl
    await queryRunner.query(
      `INSERT INTO core."ingestionFieldMapping" (
        id,
        "pipelineId",
        "sourceFieldPath",
        "targetFieldName",
        "targetCompositeSubField",
        "transform",
        "relationTargetObjectName",
        "relationMatchFieldName",
        "relationAutoCreate",
        "position"
      ) VALUES (
        gen_random_uuid(),
        '${pipelineId}',
        'recording[0].public_url',
        'recording',
        'primaryLinkUrl',
        NULL,
        NULL,
        NULL,
        false,
        15
      )`,
    );

    // Mapping 2: recording[0].public_url -> recording.primaryLinkLabel (static: "Play Recording")
    await queryRunner.query(
      `INSERT INTO core."ingestionFieldMapping" (
        id,
        "pipelineId",
        "sourceFieldPath",
        "targetFieldName",
        "targetCompositeSubField",
        "transform",
        "relationTargetObjectName",
        "relationMatchFieldName",
        "relationAutoCreate",
        "position"
      ) VALUES (
        gen_random_uuid(),
        '${pipelineId}',
        'recording[0].public_url',
        'recording',
        'primaryLinkLabel',
        '{"type": "static", "value": "Play Recording"}'::jsonb,
        NULL,
        NULL,
        false,
        16
      )`,
    );
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
