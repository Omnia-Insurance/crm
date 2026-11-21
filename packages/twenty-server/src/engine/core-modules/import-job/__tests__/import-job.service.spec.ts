import { BadRequestException, NotFoundException } from '@nestjs/common';

import { isValidUuid } from 'twenty-shared/utils';

import { IMPORT_JOB_PROCESSOR_NAME } from 'src/engine/core-modules/import-job/constants/import-job-processor-name.constant';
import { ImportJobStatus } from 'src/engine/core-modules/import-job/enums/import-job-status.enum';
import { ImportJobService } from 'src/engine/core-modules/import-job/import-job.service';

describe('ImportJobService', () => {
  const workspaceId = '20202020-1111-4222-8333-444455556666';
  const importJobId = '20202020-aaaa-4bbb-8ccc-dddddddddddd';
  const requester = {
    workspaceId,
    userWorkspaceId: '20202020-7777-4888-8999-000000000000',
  };

  const buildService = ({
    findOneResult = { id: importJobId, totalRecords: 2 },
    affected = 1,
  }: {
    findOneResult?: Record<string, unknown> | null;
    affected?: number;
  } = {}) => {
    const updateQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected }),
    };

    const importJobRepository = {
      insertAndReturnOne: jest.fn(
        async (_workspaceId: string, values: Record<string, unknown>) => ({
          id: importJobId,
          ...values,
        }),
      ),
      findOne: jest.fn().mockResolvedValue(findOneResult),
      findOneBy: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected }),
      createQueryBuilder: jest.fn(() => updateQueryBuilder),
    };

    const messageQueueService = { add: jest.fn().mockResolvedValue('job-id') };

    const service = new ImportJobService(
      importJobRepository as never,
      messageQueueService as never,
    );

    return {
      service,
      importJobRepository,
      messageQueueService,
      updateQueryBuilder,
    };
  };

  it('stores the requester, gives every row an id and enqueues one attempt', async () => {
    const { service, importJobRepository, messageQueueService } =
      buildService();

    await service.startImportJob({
      requester,
      workspaceMemberId: '20202020-5555-4666-8777-888899990000',
      objectNameSingular: 'policy',
      fileName: 'policies.csv',
      columnMappings: {},
      validatedRows: [{ id: 'existing-1', name: 'A' }, { name: 'B' }],
    });

    const [insertWorkspaceId, insertedValues] =
      importJobRepository.insertAndReturnOne.mock.calls[0];
    const [keptRow, newRow] = insertedValues.validatedRows as Record<
      string,
      unknown
    >[];

    expect(insertWorkspaceId).toBe(workspaceId);
    expect(insertedValues).toMatchObject({
      userWorkspaceId: requester.userWorkspaceId,
      workspaceMemberId: '20202020-5555-4666-8777-888899990000',
      status: ImportJobStatus.PENDING,
      totalRecords: 2,
    });
    expect(keptRow).toEqual({ id: 'existing-1', name: 'A' });
    expect(isValidUuid(newRow.id as string)).toBe(true);
    expect(messageQueueService.add).toHaveBeenCalledWith(
      IMPORT_JOB_PROCESSOR_NAME,
      { importJobId, workspaceId },
      { id: importJobId, isWorkspaceJob: true, workspaceId, retryLimit: 0 },
    );
  });

  it('marks a job failed when it cannot be queued, so its rows can be purged', async () => {
    const { service, importJobRepository, messageQueueService } =
      buildService();

    messageQueueService.add.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      service.startImportJob({
        requester,
        workspaceMemberId: null,
        objectNameSingular: 'policy',
        fileName: null,
        columnMappings: {},
        validatedRows: [{ name: 'A' }],
      }),
    ).rejects.toThrow('Redis unavailable');

    expect(importJobRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: importJobId },
      expect.objectContaining({ status: ImportJobStatus.FAILED }),
    );
  });

  it('reads a job only for its requester and never returns the uploaded rows', async () => {
    const { service, importJobRepository } = buildService();

    await service.findForRequester({ requester, importJobId });

    const [findWorkspaceId, findOptions] =
      importJobRepository.findOne.mock.calls[0];

    expect(findWorkspaceId).toBe(workspaceId);
    expect(findOptions.where).toEqual({
      id: importJobId,
      userWorkspaceId: requester.userWorkspaceId,
    });
    expect(findOptions.select).not.toHaveProperty('validatedRows');
  });

  it('answers not found for another user job, an unknown id or a malformed id', async () => {
    const { service, importJobRepository } = buildService({
      findOneResult: null,
      affected: 0,
    });

    await expect(
      service.cancelImportJob({ requester, importJobId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.finalizeImportJob({ requester, importJobId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.findForRequester({ requester, importJobId: 'not-a-uuid' }),
    ).resolves.toBeNull();

    expect(importJobRepository.update).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        id: importJobId,
        userWorkspaceId: requester.userWorkspaceId,
      }),
      { status: ImportJobStatus.CANCELLED },
    );
  });

  it('enqueues a finalized job only when it leaves the uploading status', async () => {
    const { service, messageQueueService } = buildService({ affected: 0 });

    await service.finalizeImportJob({ requester, importJobId });

    expect(messageQueueService.add).not.toHaveBeenCalled();
  });

  it('appends rows only to the requester upload and gives them ids', async () => {
    const { service, updateQueryBuilder } = buildService();

    await service.appendImportJobRows({
      requester,
      importJobId,
      rows: [{ name: 'A' }],
    });

    expect(updateQueryBuilder.andWhere).toHaveBeenCalledWith(
      '"userWorkspaceId" = :userWorkspaceId',
      { userWorkspaceId: requester.userWorkspaceId },
    );

    const [{ rows }] = updateQueryBuilder.setParameters.mock.calls[0];
    const [appendedRow] = JSON.parse(rows) as Record<string, unknown>[];

    expect(isValidUuid(appendedRow.id as string)).toBe(true);
  });

  it('rejects rows that are not a list of records', async () => {
    const { service } = buildService();

    await expect(
      service.appendImportJobRows({ requester, importJobId, rows: 'rows' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('claims a job only while it is still pending', async () => {
    const { service, importJobRepository } = buildService();

    await expect(
      service.claimPendingImportJob({ importJobId, workspaceId }),
    ).resolves.toBe(true);
    expect(importJobRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: importJobId, status: ImportJobStatus.PENDING },
      { status: ImportJobStatus.PROCESSING },
    );

    const { service: cancelledJobService } = buildService({ affected: 0 });

    await expect(
      cancelledJobService.claimPendingImportJob({ importJobId, workspaceId }),
    ).resolves.toBe(false);
  });
});
