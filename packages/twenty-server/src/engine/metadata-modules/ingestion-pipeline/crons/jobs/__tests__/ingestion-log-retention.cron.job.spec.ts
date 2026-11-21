import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { IngestionLogRetentionCronJob } from 'src/engine/metadata-modules/ingestion-pipeline/crons/jobs/ingestion-log-retention.cron.job';

const BATCH_SIZE = 1000;

const NOW = new Date('2026-11-20T07:30:00.000Z');

const THIRTY_DAYS_BEFORE_NOW = new Date('2026-10-21T07:30:00.000Z');

const setup = async ({ batchCounts }: { batchCounts: number[] }) => {
  const remainingBatchCounts = [...batchCounts];

  const query = jest.fn(async (_sql: string, _parameters: unknown[]) => [
    [],
    remainingBatchCounts.shift() ?? 0,
  ]);

  const module = await Test.createTestingModule({
    providers: [
      IngestionLogRetentionCronJob,
      { provide: getDataSourceToken(), useValue: { query } },
    ],
  }).compile();

  const job = module.get(IngestionLogRetentionCronJob);
  const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

  jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());

  return { job, query, logSpy };
};

describe('IngestionLogRetentionCronJob', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears the pushed records of completed runs and the records and errors of runs older than 30 days', async () => {
    const { job, query } = await setup({ batchCounts: [3] });

    await job.handle();

    const [[sql, parameters]] = query.mock.calls;

    expect(sql).toContain('UPDATE "core"."ingestionLog"');
    expect(sql).toContain('SET "incomingPayload" = NULL');
    expect(sql).toContain(
      'WHEN "startedAt" IS NULL OR "startedAt" < $2 THEN NULL',
    );
    expect(sql).toContain('"status" = $1 OR "startedAt" IS NULL');
    expect(sql).toContain('LIMIT $3');
    expect(parameters).toEqual([
      'completed',
      THIRTY_DAYS_BEFORE_NOW,
      BATCH_SIZE,
    ]);
  });

  it('keeps the counts and dates of every log', async () => {
    const { job, query } = await setup({ batchCounts: [1] });

    await job.handle();

    const [[sql]] = query.mock.calls;

    for (const keptColumn of [
      '"status" =',
      '"recordsCreated"',
      '"recordsFailed"',
      '"completedAt"',
      'DELETE',
    ]) {
      expect(sql.split('WHERE')[0]).not.toContain(keptColumn);
    }
  });

  it('sweeps in batches until a batch comes back short', async () => {
    const { job, query, logSpy } = await setup({
      batchCounts: [BATCH_SIZE, BATCH_SIZE, 4],
    });

    await job.handle();

    expect(query).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledWith(
      `Cleared the pushed records or errors of ${2 * BATCH_SIZE + 4} ingestion log(s)`,
    );
  });

  it('logs nothing when there is nothing to clear', async () => {
    const { job, query, logSpy } = await setup({ batchCounts: [0] });

    await job.handle();

    expect(query).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
