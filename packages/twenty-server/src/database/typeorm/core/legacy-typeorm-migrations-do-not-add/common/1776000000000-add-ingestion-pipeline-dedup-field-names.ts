import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIngestionPipelineDedupFieldNames1776000000000
  implements MigrationInterface
{
  name = 'AddIngestionPipelineDedupFieldNames1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."ingestionPipeline"
      ADD COLUMN "dedupFieldNames" character varying[]
    `);

    // Lift single-value dedup into a one-element array so existing pipelines
    // keep working under the new column.
    await queryRunner.query(`
      UPDATE "core"."ingestionPipeline"
      SET "dedupFieldNames" = ARRAY["dedupFieldName"]
      WHERE "dedupFieldName" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."ingestionPipeline"
      DROP COLUMN "dedupFieldName"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."ingestionPipeline"
      ADD COLUMN "dedupFieldName" character varying
    `);

    // Best-effort restore: keep the first element only. Multi-field dedup
    // can't be expressed in the old single-column form.
    await queryRunner.query(`
      UPDATE "core"."ingestionPipeline"
      SET "dedupFieldName" = "dedupFieldNames"[1]
      WHERE "dedupFieldNames" IS NOT NULL
        AND array_length("dedupFieldNames", 1) >= 1
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."ingestionPipeline"
      DROP COLUMN "dedupFieldNames"
    `);
  }
}
