import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { INGESTION_LOG_RETENTION_CRON_PATTERN } from 'src/engine/metadata-modules/ingestion-pipeline/crons/constants/ingestion-log-retention-cron-pattern.constant';

// Pushed records (PHI) and the errors that quote them: a completed run's records go at the next sweep,
// everything else after 30 days, which leaves time to investigate a failed or partial run.
const INGESTION_LOG_RECORDS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const UPDATE_BATCH_SIZE = 1000;

// System retention sweep with no requester, so it runs on the core datasource across every workspace.
@Injectable()
@Processor(MessageQueue.cronQueue)
export class IngestionLogRetentionCronJob {
  private readonly logger = new Logger(IngestionLogRetentionCronJob.name);

  constructor(
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {}

  @Process(IngestionLogRetentionCronJob.name)
  @SentryCronMonitor(
    IngestionLogRetentionCronJob.name,
    INGESTION_LOG_RETENTION_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const retentionThreshold = new Date(
      Date.now() - INGESTION_LOG_RECORDS_RETENTION_MS,
    );

    let clearedIngestionLogCount = 0;
    let updatedCount = 0;

    do {
      updatedCount = await this.clearIngestionLogRecords(retentionThreshold);
      clearedIngestionLogCount += updatedCount;
    } while (updatedCount === UPDATE_BATCH_SIZE);

    if (clearedIngestionLogCount > 0) {
      this.logger.log(
        `Cleared the pushed records or errors of ${clearedIngestionLogCount} ingestion log(s)`,
      );
    }
  }

  // Keeps status, counts and dates, so the log still records how each run ended.
  private async clearIngestionLogRecords(
    retentionThreshold: Date,
  ): Promise<number> {
    const [, updatedIngestionLogCount] = await this.coreDataSource.query<
      [unknown[], number]
    >(
      `UPDATE "core"."ingestionLog"
       SET "incomingPayload" = NULL,
           "errors" = CASE
             WHEN "startedAt" IS NULL OR "startedAt" < $2 THEN NULL
             ELSE "errors"
           END
       WHERE "id" IN (
         SELECT "id" FROM "core"."ingestionLog"
         WHERE ("incomingPayload" IS NOT NULL
             AND ("status" = $1 OR "startedAt" IS NULL OR "startedAt" < $2))
           OR ("errors" IS NOT NULL
             AND ("startedAt" IS NULL OR "startedAt" < $2))
         LIMIT $3
       )`,
      ['completed', retentionThreshold, UPDATE_BATCH_SIZE],
    );

    return updatedIngestionLogCount;
  }
}
