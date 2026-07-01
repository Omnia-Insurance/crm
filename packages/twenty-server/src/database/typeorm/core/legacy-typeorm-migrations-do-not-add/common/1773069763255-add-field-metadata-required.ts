import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldMetadataRequired1773069763255 implements MigrationInterface {
    name = 'AddFieldMetadataRequired1773069763255'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "core"."fieldMetadata" ADD "requiredCondition" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "core"."fieldMetadata" DROP COLUMN "requiredCondition"`);
    }

}
