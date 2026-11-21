import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class ChangeSubmittedDateToDatetime1772600000000
  implements MigrationInterface
{
  name = 'ChangeSubmittedDateToDatetime1772600000000';

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

      const policyTable = await this.findTableName(
        queryRunner,
        schemaName,
        'policy',
      );

      if (!policyTable) {
        continue;
      }

      // 1. Convert column from date to timestamptz
      // Treat existing dates as Eastern midnight so they display on the correct day
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."${policyTable}"
         ALTER COLUMN "submittedDate" TYPE TIMESTAMP WITH TIME ZONE
         USING ("submittedDate"::timestamp AT TIME ZONE 'America/New_York')`,
      );

      // 2. Update field metadata type from DATE to DATE_TIME
      const objectMetadata = await queryRunner.query(
        `SELECT id FROM core."objectMetadata"
         WHERE "workspaceId" = '${workspace.id}'
           AND "nameSingular" = 'policy'`,
      );

      if (objectMetadata.length > 0) {
        await queryRunner.query(
          `UPDATE core."fieldMetadata"
           SET type = 'DATE_TIME'
           WHERE "objectMetadataId" = '${objectMetadata[0].id}'
             AND name = 'submittedDate'
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

      const policyTable = await this.findTableName(
        queryRunner,
        schemaName,
        'policy',
      );

      if (!policyTable) {
        continue;
      }

      // 1. Convert column back from timestamptz to date
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."${policyTable}"
         ALTER COLUMN "submittedDate" TYPE date
         USING ("submittedDate" AT TIME ZONE 'America/New_York')::date`,
      );

      // 2. Revert field metadata type from DATE_TIME to DATE
      const objectMetadata = await queryRunner.query(
        `SELECT id FROM core."objectMetadata"
         WHERE "workspaceId" = '${workspace.id}'
           AND "nameSingular" = 'policy'`,
      );

      if (objectMetadata.length > 0) {
        await queryRunner.query(
          `UPDATE core."fieldMetadata"
           SET type = 'DATE'
           WHERE "objectMetadataId" = '${objectMetadata[0].id}'
             AND name = 'submittedDate'
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
