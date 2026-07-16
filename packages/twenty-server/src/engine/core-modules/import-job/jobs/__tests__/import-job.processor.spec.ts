import { ImportJobStatus } from 'src/engine/core-modules/import-job/enums/import-job-status.enum';
import { ImportJobProcessor } from 'src/engine/core-modules/import-job/jobs/import-job.processor';

/**
 * OMNIA-CUSTOM: bulk import must resolve existing records through
 * repository.updateMany() (which emits UPDATED events -> `<object>.updated`
 * timeline activities with a before/after diff) and new records through
 * repository.insert(), instead of a blind repository.upsert() that only
 * emits CREATED/UPSERTED and left import-driven updates with no timeline
 * history. This test locks that behaviour in.
 */
describe('ImportJobProcessor', () => {
  const workspaceId = '20202020-1111-2222-3333-444455556666';
  const importJobId = 'import-job-1';

  const buildRepository = (existingIds: string[]) => ({
    find: jest.fn().mockResolvedValue(existingIds.map((id) => ({ id }))),
    insert: jest.fn().mockResolvedValue(undefined),
    updateMany: jest.fn().mockResolvedValue({ affected: 0 }),
    upsert: jest.fn().mockResolvedValue(undefined),
  });

  const buildProcessor = ({
    validatedRows,
    repository,
  }: {
    validatedRows: Record<string, unknown>[];
    repository: ReturnType<typeof buildRepository>;
  }) => {
    const job = {
      id: importJobId,
      status: ImportJobStatus.PENDING,
      validatedRows,
      columnMappings: null,
      objectNameSingular: 'policy',
    };

    const importJobService = {
      getImportJob: jest.fn().mockResolvedValue(job),
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(async (cb: () => Promise<void>) => {
        await cb();
      }),
      getRepository: jest.fn().mockResolvedValue(repository),
    };

    const workspaceCacheService = {
      getOrRecompute: jest.fn(),
    };

    const processor = new ImportJobProcessor(
      importJobService as never,
      globalWorkspaceOrmManager as never,
      workspaceCacheService as never,
    );

    return { processor, importJobService };
  };

  it('updates existing records via updateMany and inserts new records — never a blind upsert', async () => {
    const existingRow = { id: 'existing-1', name: 'A', status: 'CANCELED' };
    const newRow = { id: 'new-1', name: 'B', status: 'ACTIVE' };
    const repository = buildRepository(['existing-1']);

    const { processor } = buildProcessor({
      validatedRows: [existingRow, newRow],
      repository,
    });

    await processor.handle({ importJobId, workspaceId });

    // Existing record -> updateMany, id stripped out of the partialEntity so
    // it becomes a real UPDATE (the source of the UPDATED timeline event).
    expect(repository.updateMany).toHaveBeenCalledTimes(1);
    expect(repository.updateMany).toHaveBeenCalledWith([
      {
        criteria: 'existing-1',
        partialEntity: { name: 'A', status: 'CANCELED' },
      },
    ]);

    // New record -> insert (emits CREATED).
    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(repository.insert).toHaveBeenCalledWith([newRow]);

    // The old blind upsert path must not be used.
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('routes every row to insert when none of the ids exist yet', async () => {
    const rows = [
      { id: 'new-1', name: 'A' },
      { id: 'new-2', name: 'B' },
    ];
    const repository = buildRepository([]);

    const { processor } = buildProcessor({ validatedRows: rows, repository });

    await processor.handle({ importJobId, workspaceId });

    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(repository.insert).toHaveBeenCalledWith(rows);
    expect(repository.updateMany).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
