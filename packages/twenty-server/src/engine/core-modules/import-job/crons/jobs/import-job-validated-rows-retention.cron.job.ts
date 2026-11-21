import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { IMPORT_JOB_VALIDATED_ROWS_RETENTION_CRON_PATTERN } from 'src/engine/core-modules/import-job/crons/constants/import-job-validated-rows-retention-cron-pattern.constant';
import { ImportJobStatus } from 'src/engine/core-modules/import-job/enums/import-job-status.enum';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

// Staged rows, and the result errors that quote them, are PHI kept only long enough to investigate a bad import.
const VALIDATED_ROWS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const UPDATE_BATCH_SIZE = 100;

// Keyed by every status, so a new one cannot silently keep its staged rows forever.
const IS_FINISHED_BY_IMPORT_JOB_STATUS = {
  [ImportJobStatus.UPLOADING]: false,
  [ImportJobStatus.PENDING]: false,
  [ImportJobStatus.PROCESSING]: false,
  [ImportJobStatus.COMPLETED]: true,
  [ImportJobStatus.FAILED]: true,
  [ImportJobStatus.CANCELLED]: true,
} satisfies Record<ImportJobStatus, boolean>;

const FINISHED_IMPORT_JOB_STATUSES = Object.values(ImportJobStatus).filter(
  (status) => IS_FINISHED_BY_IMPORT_JOB_STATUS[status],
);

const UNFINISHED_IMPORT_JOB_STATUSES = Object.values(ImportJobStatus).filter(
  (status) => !IS_FINISHED_BY_IMPORT_JOB_STATUS[status],
);

// System retention sweep with no requester, so it runs on the core datasource across every workspace.
@Injectable()
@Processor(MessageQueue.cronQueue)
export class ImportJobValidatedRowsRetentionCronJob {
  private readonly logger = new Logger(
    ImportJobValidatedRowsRetentionCronJob.name,
  );

  constructor(
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {}

  @Process(ImportJobValidatedRowsRetentionCronJob.name)
  @SentryCronMonitor(
    ImportJobValidatedRowsRetentionCronJob.name,
    IMPORT_JOB_VALIDATED_ROWS_RETENTION_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const retentionThreshold = new Date(
      Date.now() - VALIDATED_ROWS_RETENTION_MS,
    );

    const abandonedImportJobCount = await this.updateInBatches(() =>
      this.failAbandonedImportJobs(retentionThreshold),
    );

    const finishedImportJobCount = await this.updateInBatches(() =>
      this.clearFinishedImportJobRows(retentionThreshold),
    );

    if (abandonedImportJobCount > 0 || finishedImportJobCount > 0) {
      this.logger.log(
        `Cleared the staged rows and results of ${finishedImportJobCount} finished import job(s) and failed ${abandonedImportJobCount} abandoned import job(s)`,
      );
    }
  }

  // An upload or run with no progress for the retention period was abandoned.
  private async failAbandonedImportJobs(
    retentionThreshold: Date,
  ): Promise<number> {
    const [, updatedImportJobCount] = await this.coreDataSource.query<
      [unknown[], number]
    >(
      `UPDATE "core"."importJob"
       SET "status" = $1, "validatedRows" = NULL, "result" = NULL, "updatedAt" = now()
       WHERE "id" IN (
         SELECT "id" FROM "core"."importJob"
         WHERE "status"::text = ANY($2::text[])
           AND "updatedAt" < $3
         LIMIT $4
       )
         AND "status"::text = ANY($2::text[])
         AND "updatedAt" < $3`,
      [
        ImportJobStatus.FAILED,
        UNFINISHED_IMPORT_JOB_STATUSES,
        retentionThreshold,
        UPDATE_BATCH_SIZE,
      ],
    );

    return updatedImportJobCount;
  }

  // Keeps status, counts and updatedAt, so the row still records how and when the import ended.
  private async clearFinishedImportJobRows(
    retentionThreshold: Date,
  ): Promise<number> {
    const [, updatedImportJobCount] = await this.coreDataSource.query<
      [unknown[], number]
    >(
      `UPDATE "core"."importJob"
       SET "validatedRows" = NULL, "result" = NULL
       WHERE "id" IN (
         SELECT "id" FROM "core"."importJob"
         WHERE "status"::text = ANY($1::text[])
           AND ("validatedRows" IS NOT NULL OR "result" IS NOT NULL)
           AND "updatedAt" < $2
         LIMIT $3
       )
         AND "status"::text = ANY($1::text[])
         AND ("validatedRows" IS NOT NULL OR "result" IS NOT NULL)
         AND "updatedAt" < $2`,
      [FINISHED_IMPORT_JOB_STATUSES, retentionThreshold, UPDATE_BATCH_SIZE],
    );

    return updatedImportJobCount;
  }

  private async updateInBatches(
    updateBatch: () => Promise<number>,
  ): Promise<number> {
    let totalUpdatedCount = 0;
    let updatedCount = 0;

    do {
      updatedCount = await updateBatch();
      totalUpdatedCount += updatedCount;
    } while (updatedCount === UPDATE_BATCH_SIZE);

    return totalUpdatedCount;
  }
}
