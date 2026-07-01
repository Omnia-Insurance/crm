import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIngestionLogIncomingPayload1771400000000
  implements MigrationInterface
{
  name = 'AddIngestionLogIncomingPayload1771400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."ingestionLog"
      ADD COLUMN "incomingPayload" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."ingestionLog"
      DROP COLUMN "incomingPayload"
    `);
  }
}
