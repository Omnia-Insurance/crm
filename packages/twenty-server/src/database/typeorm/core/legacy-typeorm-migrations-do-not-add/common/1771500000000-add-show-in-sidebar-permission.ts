import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddShowInSidebarPermission1771500000000
  implements MigrationInterface
{
  name = 'AddShowInSidebarPermission1771500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."role" ADD "showAllObjectsInSidebar" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."objectPermission" ADD "showInSidebar" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."objectPermission" DROP COLUMN "showInSidebar"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."role" DROP COLUMN "showAllObjectsInSidebar"`,
    );
  }
}
