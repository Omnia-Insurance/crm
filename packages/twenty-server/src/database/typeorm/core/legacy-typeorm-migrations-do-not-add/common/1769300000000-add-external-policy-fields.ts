import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddExternalPolicyFields1769300000000
  implements MigrationInterface
{
  name = 'AddExternalPolicyFields1769300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Get all workspace schemas
    const workspaces = await queryRunner.query(
      `SELECT id FROM core.workspace WHERE "deletedAt" IS NULL`,
    );

    for (const workspace of workspaces) {
      const schemaName = `workspace_${workspace.id.replace(/-/g, '')}`;

      // Check if policy table exists in this workspace
      const tableExists = await queryRunner.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = '${schemaName}'
          AND table_name = 'policy'
        )`,
      );

      if (!tableExists[0].exists) {
        continue;
      }

      // Add external system tracking fields
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy"
         ADD COLUMN IF NOT EXISTS "applicationId" text`,
      );

      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy"
         ADD COLUMN IF NOT EXISTS "externalPolicyId" text`,
      );

      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy"
         ADD COLUMN IF NOT EXISTS "externalSource" text`,
      );

      // Add policy details fields
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy"
         ADD COLUMN IF NOT EXISTS "planIdentifier" text`,
      );

      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy"
         ADD COLUMN IF NOT EXISTS "memberIdentifiers" jsonb`,
      );

      // Add payment tracking fields
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy"
         ADD COLUMN IF NOT EXISTS "paymentStatus" text`,
      );

      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy"
         ADD COLUMN IF NOT EXISTS "pastDueAmount" jsonb`,
      );

      // Add sync metadata
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy"
         ADD COLUMN IF NOT EXISTS "lastExternalSync" timestamp with time zone`,
      );

      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy"
         ADD COLUMN IF NOT EXISTS "externalSyncCount" integer DEFAULT 0`,
      );

      // Create indexes for performance
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_policy_applicationId_${workspace.id.replace(/-/g, '_')}"
         ON "${schemaName}"."policy" ("applicationId")`,
      );

      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_policy_externalSource_${workspace.id.replace(/-/g, '_')}"
         ON "${schemaName}"."policy" ("externalSource")`,
      );

      // Composite index for fast dedup (applicationId + externalSource)
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_policy_app_source_${workspace.id.replace(/-/g, '_')}"
         ON "${schemaName}"."policy" ("applicationId", "externalSource")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const workspaces = await queryRunner.query(
      `SELECT id FROM core.workspace WHERE "deletedAt" IS NULL`,
    );

    for (const workspace of workspaces) {
      const schemaName = `workspace_${workspace.id.replace(/-/g, '')}`;

      const tableExists = await queryRunner.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = '${schemaName}'
          AND table_name = 'policy'
        )`,
      );

      if (!tableExists[0].exists) {
        continue;
      }

      // Drop indexes
      await queryRunner.query(
        `DROP INDEX IF EXISTS "${schemaName}"."IDX_policy_app_source_${workspace.id.replace(/-/g, '_')}"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "${schemaName}"."IDX_policy_externalSource_${workspace.id.replace(/-/g, '_')}"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "${schemaName}"."IDX_policy_applicationId_${workspace.id.replace(/-/g, '_')}"`,
      );

      // Drop columns
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy" DROP COLUMN IF EXISTS "externalSyncCount"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy" DROP COLUMN IF EXISTS "lastExternalSync"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy" DROP COLUMN IF EXISTS "pastDueAmount"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy" DROP COLUMN IF EXISTS "paymentStatus"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy" DROP COLUMN IF EXISTS "memberIdentifiers"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy" DROP COLUMN IF EXISTS "planIdentifier"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy" DROP COLUMN IF EXISTS "externalSource"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy" DROP COLUMN IF EXISTS "externalPolicyId"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."policy" DROP COLUMN IF EXISTS "applicationId"`,
      );
    }
  }
}
