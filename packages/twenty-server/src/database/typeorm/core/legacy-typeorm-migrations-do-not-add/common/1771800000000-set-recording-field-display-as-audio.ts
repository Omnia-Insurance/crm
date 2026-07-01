import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class SetRecordingFieldDisplayAsAudio1771800000000
  implements MigrationInterface
{
  name = 'SetRecordingFieldDisplayAsAudio1771800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE core."fieldMetadata"
      SET settings = COALESCE(settings, '{}'::jsonb) || '{"displayAs": "audio"}'::jsonb
      WHERE name = 'recording'
        AND "objectMetadataId" IN (
          SELECT id FROM core."objectMetadata" WHERE "nameSingular" = 'call'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE core."fieldMetadata"
      SET settings = settings - 'displayAs'
      WHERE name = 'recording'
        AND "objectMetadataId" IN (
          SELECT id FROM core."objectMetadata" WHERE "nameSingular" = 'call'
        )
    `);
  }
}
