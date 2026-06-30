import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class UseTemplateForStandardViewNames1770854400000
  implements MigrationInterface
{
  name = 'UseTemplateForStandardViewNames1770854400000';

  // Map of hardcoded view names to their template replacement
  private readonly viewNameReplacements = [
    'All People',
    'All Companies',
    'All Opportunities',
    'All Tasks',
    'All Notes',
    'All Messages',
    'All Calendar Events',
    'All Dashboards',
    'All Message Threads',
    'All Workflows',
    'All Workflow Runs',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const oldName of this.viewNameReplacements) {
      await queryRunner.query(
        `UPDATE "core"."view" SET "name" = 'All {objectLabelPlural}' WHERE "name" = $1 AND "isCustom" = false`,
        [oldName],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting is not straightforward since we'd need object metadata to reconstruct
    // the original names. Instead, the resolver already handles both formats.
  }
}
