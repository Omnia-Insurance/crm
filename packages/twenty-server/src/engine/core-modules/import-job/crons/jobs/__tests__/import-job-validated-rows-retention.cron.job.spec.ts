import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { ImportJobValidatedRowsRetentionCronJob } from 'src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job';

const BATCH_SIZE = 100;

const NOW = new Date('2026-11-18T07:00:00.000Z');

const THIRTY_DAYS_BEFORE_NOW = new Date('2026-10-19T07:00:00.000Z');

const isAbandonedImportJobSweep = (sql: string) => sql.includes('SET "status"');

const setup = async ({
  abandonedBatchCounts,
  finishedBatchCounts,
}: {
  abandonedBatchCounts: number[];
  finishedBatchCounts: number[];
}) => {
  const remainingAbandonedBatchCounts = [...abandonedBatchCounts];
  const remainingFinishedBatchCounts = [...finishedBatchCounts];

  const query = jest.fn(async (sql: string, _parameters: unknown[]) => {
    const remainingBatchCounts = isAbandonedImportJobSweep(sql)
      ? remainingAbandonedBatchCounts
      : remainingFinishedBatchCounts;

    return [[], remainingBatchCounts.shift() ?? 0];
  });

  const module = await Test.createTestingModule({
    providers: [
      ImportJobValidatedRowsRetentionCronJob,
      { provide: getDataSourceToken(), useValue: { query } },
    ],
  }).compile();

  const job = module.get(ImportJobValidatedRowsRetentionCronJob);
  const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

  jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());

  const getSweepCalls = (isAbandonedSweep: boolean) =>
    query.mock.calls.filter(
      ([sql]) => isAbandonedImportJobSweep(sql) === isAbandonedSweep,
    );

  return { job, logSpy, getSweepCalls };
};

describe('ImportJobValidatedRowsRetentionCronJob', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails uploads and runs with no progress for 30 days and clears their staged rows and results', async () => {
    const { job, getSweepCalls } = await setup({
      abandonedBatchCounts: [2],
      finishedBatchCounts: [0],
    });

    await job.handle();

    const [[sql, parameters]] = getSweepCalls(true);

    expect(sql).toContain(
      'SET "status" = $1, "validatedRows" = NULL, "result" = NULL, "updatedAt" = now()',
    );
    expect(sql).toContain('"status"::text = ANY($2::text[])');
    expect(sql).toContain('"updatedAt" < $3');
    expect(sql).toContain('LIMIT $4');
    expect(parameters).toEqual([
      'failed',
      ['uploading', 'pending', 'processing'],
      THIRTY_DAYS_BEFORE_NOW,
      BATCH_SIZE,
    ]);
  });

  // Result errors quote the staged rows (lead names, database messages that echo cell values)
  it('clears the staged rows and results of finished imports 30 days after they ended, keeping their status and end time', async () => {
    const { job, getSweepCalls } = await setup({
      abandonedBatchCounts: [0],
      finishedBatchCounts: [3],
    });

    await job.handle();

    const [[sql, parameters]] = getSweepCalls(false);

    expect(sql).toMatch(/SET "validatedRows" = NULL, "result" = NULL\s+WHERE/);
    expect(sql).toContain('"status"::text = ANY($1::text[])');
    expect(sql).toContain(
      '("validatedRows" IS NOT NULL OR "result" IS NOT NULL)',
    );
    expect(sql).toContain('"updatedAt" < $2');
    expect(sql).toContain('LIMIT $3');
    expect(parameters).toEqual([
      ['completed', 'failed', 'cancelled'],
      THIRTY_DAYS_BEFORE_NOW,
      BATCH_SIZE,
    ]);
  });

  it('repeats each sweep until a batch comes back short, then logs the totals', async () => {
    const { job, logSpy, getSweepCalls } = await setup({
      abandonedBatchCounts: [BATCH_SIZE, 4],
      finishedBatchCounts: [BATCH_SIZE, BATCH_SIZE, 0],
    });

    await job.handle();

    expect(getSweepCalls(true)).toHaveLength(2);
    expect(getSweepCalls(false)).toHaveLength(3);
    expect(logSpy).toHaveBeenCalledWith(
      'Cleared the staged rows and results of 200 finished import job(s) and failed 104 abandoned import job(s)',
    );
  });

  it('runs one batch of each sweep and logs nothing when no import job is due', async () => {
    const { job, logSpy, getSweepCalls } = await setup({
      abandonedBatchCounts: [0],
      finishedBatchCounts: [0],
    });

    await job.handle();

    expect(getSweepCalls(true)).toHaveLength(1);
    expect(getSweepCalls(false)).toHaveLength(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
