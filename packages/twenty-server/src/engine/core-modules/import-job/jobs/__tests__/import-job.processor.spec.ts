import { PermissionFlagType, QUERY_MAX_RECORDS } from 'twenty-shared/constants';
import { FieldActorSource } from 'twenty-shared/types';

import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ImportJobStatus } from 'src/engine/core-modules/import-job/enums/import-job-status.enum';
import { ImportJobProcessor } from 'src/engine/core-modules/import-job/jobs/import-job.processor';
import { resolveImportRelations } from 'src/engine/core-modules/import-job/utils/resolve-import-relations.util';

jest.mock(
  'src/engine/core-modules/import-job/utils/resolve-import-relations.util',
  () => ({ resolveImportRelations: jest.fn() }),
);

type ImportRow = Record<string, unknown>;

// Existing records must go through updateMany (an UPDATED event with a diff, so re-imports leave timeline
// history) and new ones through insert, as the requester and never through a bypassing repository
describe('ImportJobProcessor', () => {
  const workspaceId = '20202020-1111-4222-8333-444455556666';
  const importJobId = '20202020-aaaa-4bbb-8ccc-dddddddddddd';
  const userWorkspaceId = '20202020-7777-4888-8999-000000000000';
  const requesterAuthContext = {
    type: 'user',
    workspace: { id: workspaceId },
    userWorkspaceId,
  } as unknown as WorkspaceAuthContext;
  const requesterActor = {
    source: FieldActorSource.MANUAL,
    name: 'Agent Smith',
    workspaceMemberId: '20202020-5555-4666-8777-888899990000',
    context: {},
  };

  const buildRepository = ({
    existingIds = [],
    updatableIds,
  }: {
    existingIds?: string[];
    updatableIds?: string[];
  } = {}) => ({
    find: jest.fn().mockResolvedValue(existingIds.map((id) => ({ id }))),
    insert: jest.fn(async (rows: ImportRow[]) => ({
      identifiers: rows.map((row) => ({ id: row.id })),
    })),
    updateMany: jest.fn(async (inputs: { criteria: string }[]) => ({
      affected: inputs.filter(
        (input) => updatableIds?.includes(input.criteria) ?? true,
      ).length,
    })),
    update: jest.fn(),
    upsert: jest.fn(),
  });

  const buildProcessor = ({
    validatedRows = [],
    repository = buildRepository(),
    status = ImportJobStatus.PENDING,
    isClaimed = true,
    currentStatus = ImportJobStatus.PROCESSING,
    columnMappings = null,
    jobUserWorkspaceId = userWorkspaceId,
    canImport = true,
    resolveRequester = jest.fn().mockResolvedValue(requesterAuthContext),
  }: {
    validatedRows?: ImportRow[];
    repository?: ReturnType<typeof buildRepository>;
    status?: ImportJobStatus;
    isClaimed?: boolean;
    currentStatus?: ImportJobStatus;
    columnMappings?: Record<string, unknown> | null;
    jobUserWorkspaceId?: string | null;
    canImport?: boolean;
    resolveRequester?: jest.Mock;
  } = {}) => {
    const importJobService = {
      findById: jest.fn().mockResolvedValue({
        id: importJobId,
        workspaceId,
        userWorkspaceId: jobUserWorkspaceId,
        status,
        validatedRows,
        columnMappings,
        objectNameSingular: 'policy',
      }),
      claimPendingImportJob: jest.fn().mockResolvedValue(isClaimed),
      findStatusById: jest.fn().mockResolvedValue(currentStatus),
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(
        async (callback: () => Promise<void>) => callback(),
      ),
      getRepository: jest.fn().mockReturnValue(repository),
    };

    // Records every ORM manager member the processor reaches for, so no repository that skips permission checks slips in
    const usedOrmManagerMembers = new Set<string>();
    const recordingWorkspaceOrmManager = new Proxy(workspaceOrmManager, {
      get: (target, property, receiver) => {
        usedOrmManagerMembers.add(String(property));

        return Reflect.get(target, property, receiver);
      },
    });

    const userWorkspaceAuthContextService = { resolve: resolveRequester };

    const settingPermissionsService = {
      hasPermissionFlag: jest.fn().mockResolvedValue(canImport),
    };

    const actorFromAuthContextService = {
      injectActorFieldsOnCreate: jest.fn(
        async ({ records }: { records: ImportRow[] }) =>
          records.map((record) => ({
            ...record,
            createdBy: requesterActor,
            updatedBy: requesterActor,
          })),
      ),
      injectUpdatedBy: jest.fn(async ({ records }: { records: ImportRow[] }) =>
        records.map((record) => ({ ...record, updatedBy: requesterActor })),
      ),
    };

    const processor = new ImportJobProcessor(
      importJobService as never,
      recordingWorkspaceOrmManager as never,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatObjectMetadataMaps: {},
          flatFieldMetadataMaps: {},
        }),
      } as never,
      userWorkspaceAuthContextService as never,
      settingPermissionsService as never,
      actorFromAuthContextService as never,
    );

    return {
      processor,
      importJobService,
      workspaceOrmManager,
      usedOrmManagerMembers,
      settingPermissionsService,
      resolveRequester,
    };
  };

  const expectFailedWithoutWrites = ({
    importJobService,
    workspaceOrmManager,
    repository,
    errorMessage,
  }: Pick<
    ReturnType<typeof buildProcessor>,
    'importJobService' | 'workspaceOrmManager'
  > & {
    repository: ReturnType<typeof buildRepository>;
    errorMessage: string;
  }) => {
    expect(importJobService.updateProgress).toHaveBeenCalledTimes(1);
    expect(importJobService.updateProgress).toHaveBeenCalledWith({
      importJobId,
      workspaceId,
      updates: {
        status: ImportJobStatus.FAILED,
        result: { errors: [{ error: errorMessage }] },
      },
    });
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
    expect(workspaceOrmManager.getRepository).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
    expect(repository.updateMany).not.toHaveBeenCalled();
  };

  it('updates existing records via updateMany and inserts new records — never a blind upsert', async () => {
    const existingRow = { id: 'existing-1', name: 'A', status: 'CANCELED' };
    const newRow = { id: 'new-1', name: 'B', status: 'ACTIVE' };
    const repository = buildRepository({ existingIds: ['existing-1'] });

    const { processor, importJobService } = buildProcessor({
      validatedRows: [existingRow, newRow],
      repository,
    });

    await processor.handle({ importJobId, workspaceId });

    expect(repository.updateMany).toHaveBeenCalledTimes(1);
    expect(repository.updateMany).toHaveBeenCalledWith([
      {
        criteria: 'existing-1',
        partialEntity: {
          name: 'A',
          status: 'CANCELED',
          updatedBy: requesterActor,
        },
      },
    ]);
    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(repository.insert).toHaveBeenCalledWith([
      {
        ...newRow,
        createdBy: { ...requesterActor, source: FieldActorSource.IMPORT },
        updatedBy: requesterActor,
      },
    ]);
    expect(repository.upsert).not.toHaveBeenCalled();
    expect(importJobService.updateProgress).toHaveBeenLastCalledWith({
      importJobId,
      workspaceId,
      updates: expect.objectContaining({
        status: ImportJobStatus.COMPLETED,
        successCount: 2,
        failureCount: 0,
      }),
    });
  });

  it('routes every row to insert when none of the ids exist yet', async () => {
    const rows = [
      { id: 'new-1', name: 'A' },
      { id: 'new-2', name: 'B' },
    ];
    const repository = buildRepository();

    const { processor } = buildProcessor({ validatedRows: rows, repository });

    await processor.handle({ importJobId, workspaceId });

    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(repository.insert).toHaveBeenCalledWith(
      rows.map((row) => expect.objectContaining(row)),
    );
    expect(repository.updateMany).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('never rewrites who created a record it updates', async () => {
    const repository = buildRepository({ existingIds: ['existing-1'] });

    const { processor } = buildProcessor({
      validatedRows: [
        {
          id: 'existing-1',
          name: 'A',
          createdBy: { source: FieldActorSource.API, name: 'Someone else' },
        },
      ],
      repository,
    });

    await processor.handle({ importJobId, workspaceId });

    expect(repository.updateMany).toHaveBeenCalledWith([
      {
        criteria: 'existing-1',
        partialEntity: { name: 'A', updatedBy: requesterActor },
      },
    ]);
  });

  it('counts records the requester cannot edit as failures', async () => {
    const repository = buildRepository({
      existingIds: ['existing-1', 'existing-2'],
      updatableIds: ['existing-1'],
    });

    const { processor, importJobService } = buildProcessor({
      validatedRows: [
        { id: 'existing-1', name: 'A' },
        { id: 'existing-2', name: 'B' },
      ],
      repository,
    });

    await processor.handle({ importJobId, workspaceId });

    expect(importJobService.updateProgress).toHaveBeenLastCalledWith({
      importJobId,
      workspaceId,
      updates: expect.objectContaining({
        status: ImportJobStatus.COMPLETED,
        successCount: 1,
        failureCount: 1,
        result: {
          warnings: [],
          errors: [
            {
              batchIndex: 0,
              error:
                '1 record could not be updated. You may not have permission to edit them.',
            },
          ],
        },
      }),
    });
  });

  it('runs every read and write in the requester context with permission-checked repositories', async () => {
    const {
      processor,
      workspaceOrmManager,
      usedOrmManagerMembers,
      resolveRequester,
    } = buildProcessor({ validatedRows: [{ id: 'new-1', name: 'A' }] });

    await processor.handle({ importJobId, workspaceId });

    expect(resolveRequester).toHaveBeenCalledWith({
      workspaceId,
      userWorkspaceId,
    });
    expect(workspaceOrmManager.executeInWorkspaceContext).toHaveBeenCalledTimes(
      1,
    );
    expect(workspaceOrmManager.executeInWorkspaceContext.mock.calls[0]).toEqual(
      [expect.any(Function), requesterAuthContext],
    );
    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith('policy');
    expect([...usedOrmManagerMembers].sort()).toEqual([
      'executeInWorkspaceContext',
      'getRepository',
    ]);
  });

  it('fails a job redelivered while processing without writing any record', async () => {
    const repository = buildRepository();
    const {
      processor,
      importJobService,
      workspaceOrmManager,
      resolveRequester,
    } = buildProcessor({
      validatedRows: [{ id: 'new-1', name: 'A' }],
      repository,
      status: ImportJobStatus.PROCESSING,
    });

    await processor.handle({ importJobId, workspaceId });

    expectFailedWithoutWrites({
      importJobService,
      workspaceOrmManager,
      repository,
      errorMessage:
        'The import worker restarted while processing this import; re-run the import.',
    });
    expect(resolveRequester).not.toHaveBeenCalled();
  });

  it('fails without writing when the requester is no longer a workspace member', async () => {
    const repository = buildRepository();
    const { processor, importJobService, workspaceOrmManager } = buildProcessor(
      {
        validatedRows: [{ id: 'new-1', name: 'A' }],
        repository,
        resolveRequester: jest
          .fn()
          .mockRejectedValue(
            new AuthException(
              'User workspace not found',
              AuthExceptionCode.UNAUTHENTICATED,
            ),
          ),
      },
    );

    await processor.handle({ importJobId, workspaceId });

    expectFailedWithoutWrites({
      importJobService,
      workspaceOrmManager,
      repository,
      errorMessage: 'The import requester is no longer a workspace member.',
    });
  });

  it('fails without writing when the requester no longer has IMPORT_CSV', async () => {
    const repository = buildRepository();
    const {
      processor,
      importJobService,
      workspaceOrmManager,
      settingPermissionsService,
    } = buildProcessor({
      validatedRows: [{ id: 'new-1', name: 'A' }],
      repository,
      canImport: false,
    });

    await processor.handle({ importJobId, workspaceId });

    expect(settingPermissionsService.hasPermissionFlag).toHaveBeenCalledWith({
      authContext: requesterAuthContext,
      permissionFlag: PermissionFlagType.IMPORT_CSV,
    });
    expectFailedWithoutWrites({
      importJobService,
      workspaceOrmManager,
      repository,
      errorMessage: 'You do not have permission to import records.',
    });
  });

  it('fails without writing when the job has no requester', async () => {
    const repository = buildRepository();
    const {
      processor,
      importJobService,
      workspaceOrmManager,
      resolveRequester,
    } = buildProcessor({
      validatedRows: [{ id: 'new-1', name: 'A' }],
      repository,
      jobUserWorkspaceId: null,
    });

    await processor.handle({ importJobId, workspaceId });

    expectFailedWithoutWrites({
      importJobService,
      workspaceOrmManager,
      repository,
      errorMessage: 'This import has no requester. Re-run the import.',
    });
    expect(resolveRequester).not.toHaveBeenCalled();
  });

  it('does nothing for a job that already finished', async () => {
    const repository = buildRepository();
    const { processor, importJobService, workspaceOrmManager } = buildProcessor(
      {
        validatedRows: [{ id: 'new-1', name: 'A' }],
        repository,
        status: ImportJobStatus.COMPLETED,
      },
    );

    await processor.handle({ importJobId, workspaceId });

    expect(importJobService.claimPendingImportJob).not.toHaveBeenCalled();
    expect(importJobService.updateProgress).not.toHaveBeenCalled();
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('starts nothing when a cancel lands before the worker claims the job', async () => {
    const repository = buildRepository();
    const {
      processor,
      importJobService,
      workspaceOrmManager,
      resolveRequester,
    } = buildProcessor({
      validatedRows: [{ id: 'new-1', name: 'A' }],
      repository,
      isClaimed: false,
    });

    await processor.handle({ importJobId, workspaceId });

    expect(importJobService.claimPendingImportJob).toHaveBeenCalledWith({
      importJobId,
      workspaceId,
    });
    expect(importJobService.updateProgress).not.toHaveBeenCalled();
    expect(resolveRequester).not.toHaveBeenCalled();
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('checks the requester again before every batch and stops once IMPORT_CSV is revoked', async () => {
    const rows = Array.from({ length: QUERY_MAX_RECORDS + 1 }, (_, index) => ({
      id: `new-${index}`,
      name: `Row ${index}`,
    }));
    const repository = buildRepository();
    const {
      processor,
      importJobService,
      workspaceOrmManager,
      settingPermissionsService,
      resolveRequester,
    } = buildProcessor({ validatedRows: rows, repository });

    // Before the run, before the first batch, then revoked before the second
    settingPermissionsService.hasPermissionFlag
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const handling = processor.handle({ importJobId, workspaceId });

    await jest.runAllTimersAsync();
    await handling;

    expect(resolveRequester).toHaveBeenCalledTimes(3);
    expect(workspaceOrmManager.executeInWorkspaceContext).toHaveBeenCalledTimes(
      1,
    );
    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(repository.insert.mock.calls[0][0]).toHaveLength(QUERY_MAX_RECORDS);
    expect(importJobService.updateProgress).toHaveBeenLastCalledWith({
      importJobId,
      workspaceId,
      updates: {
        status: ImportJobStatus.FAILED,
        result: {
          warnings: [],
          errors: [{ error: 'You do not have permission to import records.' }],
        },
      },
    });
  });

  it('writes nothing when the import is cancelled while its relations are resolved', async () => {
    const repository = buildRepository({ existingIds: ['policy-1'] });

    jest.mocked(resolveImportRelations).mockResolvedValue({
      errors: [],
      warnings: [],
      relatedRecordUpdates: [
        {
          recordId: 'person-1',
          objectNameSingular: 'person',
          fields: { dateOfBirth: '1980-01-01' },
          sourceRowIndices: [0],
        },
      ],
      reassignments: [],
      newRecords: [
        {
          objectNameSingular: 'person',
          data: { name: { firstName: 'Jordan', lastName: 'Testlead' } },
          reassignment: { mainRecordId: 'policy-1', joinColumnName: 'leadId' },
        },
      ],
      processedRows: [{ id: 'policy-1', name: 'A' }],
    });

    const { processor, importJobService, workspaceOrmManager } = buildProcessor(
      {
        validatedRows: [
          { id: 'policy-1', name: 'A', 'lead.dateOfBirth': '1980-01-01' },
        ],
        repository,
        columnMappings: {
          relationBehaviors: [
            {
              relationFieldName: 'lead',
              behavior: 'SMART_UPDATE',
              onNotFound: 'CREATE',
            },
          ],
        },
        currentStatus: ImportJobStatus.CANCELLED,
      },
    );

    await processor.handle({ importJobId, workspaceId });

    expect(resolveImportRelations).toHaveBeenCalledTimes(1);
    expect(workspaceOrmManager.executeInWorkspaceContext).toHaveBeenCalledTimes(
      1,
    );
    expect(repository.insert).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.updateMany).not.toHaveBeenCalled();
    expect(importJobService.updateProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({ status: expect.anything() }),
      }),
    );
  });
});
