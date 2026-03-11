import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddScopeToRowLevelPermissionPredicates1773079000000
  implements MigrationInterface
{
  name = 'AddScopeToRowLevelPermissionPredicates1773079000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "core"."rowLevelPermissionPredicate_scope_enum" AS ENUM('ALL', 'READ', 'WRITE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."rowLevelPermissionPredicate" ADD "scope" "core"."rowLevelPermissionPredicate_scope_enum" NOT NULL DEFAULT 'ALL'`,
    );
    await queryRunner.query(
      `CREATE TYPE "core"."rowLevelPermissionPredicateGroup_scope_enum" AS ENUM('ALL', 'READ', 'WRITE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."rowLevelPermissionPredicateGroup" ADD "scope" "core"."rowLevelPermissionPredicateGroup_scope_enum" NOT NULL DEFAULT 'ALL'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."rowLevelPermissionPredicateGroup" DROP COLUMN "scope"`,
    );
    await queryRunner.query(
      `DROP TYPE "core"."rowLevelPermissionPredicateGroup_scope_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."rowLevelPermissionPredicate" DROP COLUMN "scope"`,
    );
    await queryRunner.query(
      `DROP TYPE "core"."rowLevelPermissionPredicate_scope_enum"`,
    );
  }
}
