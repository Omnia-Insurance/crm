import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Drop the NOT NULL constraint on `core.objectMetadata.dataSourceId`.
 *
 * The entity was changed to `@Column({ nullable: true })` ages ago (the FK
 * was dropped, column kept "for data preservation only"), but no migration
 * was ever written to align the schema. Local databases that were hand-altered
 * during debugging diverged from prod, where the original NOT NULL from
 * `1700140427984-setupMetadataTables` still applies.
 *
 * This blocks the reconciliation seed (`workspace:seed-reconciliation-objects`)
 * from creating new workspace objects: the seed omits `dataSourceId` because
 * `CreateObjectInput` and `FlatObjectMetadata` no longer expose it, so the
 * insert fails with a NOT NULL violation.
 */
export class MakeObjectMetadataDataSourceIdNullable1777497710906
  implements MigrationInterface
{
  name = 'MakeObjectMetadataDataSourceIdNullable1777497710906';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."objectMetadata" ALTER COLUMN "dataSourceId" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restoring NOT NULL would fail on any rows where dataSourceId is null
    // (which is exactly why we're dropping it). Backfill before re-applying.
    await queryRunner.query(
      `UPDATE "core"."objectMetadata"
         SET "dataSourceId" = (
           SELECT "dataSourceId"
           FROM "core"."objectMetadata" om2
           WHERE om2."workspaceId" = "core"."objectMetadata"."workspaceId"
             AND om2."dataSourceId" IS NOT NULL
           LIMIT 1
         )
       WHERE "dataSourceId" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."objectMetadata" ALTER COLUMN "dataSourceId" SET NOT NULL`,
    );
  }
}
