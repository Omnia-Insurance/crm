import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIngestionPipelineEntities1771284860000
  implements MigrationInterface
{
  name = 'AddIngestionPipelineEntities1771284860000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "core"."ingestionPipeline" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "mode" character varying NOT NULL,
        "targetObjectNameSingular" character varying NOT NULL,
        "webhookSecret" character varying,
        "sourceUrl" text,
        "sourceHttpMethod" character varying,
        "sourceAuthConfig" jsonb,
        "sourceRequestConfig" jsonb,
        "responseRecordsPath" character varying,
        "schedule" character varying,
        "dedupFieldName" character varying,
        "paginationConfig" jsonb,
        "isEnabled" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_ingestionPipeline" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INGESTION_PIPELINE_WORKSPACE_ID"
      ON "core"."ingestionPipeline" ("workspaceId")
    `);

    await queryRunner.query(`
      CREATE TABLE "core"."ingestionFieldMapping" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "pipelineId" uuid NOT NULL,
        "sourceFieldPath" character varying NOT NULL,
        "targetFieldName" character varying NOT NULL,
        "targetCompositeSubField" character varying,
        "transform" jsonb,
        "relationTargetObjectName" character varying,
        "relationMatchFieldName" character varying,
        "relationAutoCreate" boolean NOT NULL DEFAULT false,
        "position" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_ingestionFieldMapping" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ingestionFieldMapping_pipeline" FOREIGN KEY ("pipelineId")
          REFERENCES "core"."ingestionPipeline"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INGESTION_FIELD_MAPPING_PIPELINE_ID"
      ON "core"."ingestionFieldMapping" ("pipelineId")
    `);

    await queryRunner.query(`
      CREATE TABLE "core"."ingestionLog" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "pipelineId" uuid NOT NULL,
        "status" character varying NOT NULL,
        "triggerType" character varying NOT NULL,
        "totalRecordsReceived" integer NOT NULL DEFAULT 0,
        "recordsCreated" integer NOT NULL DEFAULT 0,
        "recordsUpdated" integer NOT NULL DEFAULT 0,
        "recordsSkipped" integer NOT NULL DEFAULT 0,
        "recordsFailed" integer NOT NULL DEFAULT 0,
        "errors" jsonb,
        "startedAt" TIMESTAMP WITH TIME ZONE,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "durationMs" integer,
        CONSTRAINT "PK_ingestionLog" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ingestionLog_pipeline" FOREIGN KEY ("pipelineId")
          REFERENCES "core"."ingestionPipeline"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INGESTION_LOG_PIPELINE_ID"
      ON "core"."ingestionLog" ("pipelineId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INGESTION_LOG_STARTED_AT"
      ON "core"."ingestionLog" ("startedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."ingestionLog"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."ingestionFieldMapping"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."ingestionPipeline"`,
    );
  }
}
