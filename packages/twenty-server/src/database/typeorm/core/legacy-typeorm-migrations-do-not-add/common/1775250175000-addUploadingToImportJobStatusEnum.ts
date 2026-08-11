import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUploadingToImportJobStatusEnum1775250175000
  implements MigrationInterface
{
  name = 'AddUploadingToImportJobStatusEnum1775250175000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE core."importJob_status_enum" ADD VALUE IF NOT EXISTS 'uploading' BEFORE 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing enum values directly.
    // The 'uploading' value is harmless if left in place.
  }
}
