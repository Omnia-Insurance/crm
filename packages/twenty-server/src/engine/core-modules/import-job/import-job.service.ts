import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { t } from '@lingui/core/macro';
import { isDefined, isPlainObject, isValidUuid } from 'twenty-shared/utils';
import { In } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { IMPORT_JOB_PROCESSOR_NAME } from 'src/engine/core-modules/import-job/constants/import-job-processor-name.constant';
import { IMPORT_JOB_SUMMARY_SELECT } from 'src/engine/core-modules/import-job/constants/import-job-summary-select.constant';
import { ImportJobEntity } from 'src/engine/core-modules/import-job/entities/import-job.entity';
import { ImportJobStatus } from 'src/engine/core-modules/import-job/enums/import-job-status.enum';
import { type ImportJobData } from 'src/engine/core-modules/import-job/types/import-job-data.type';
import { type ImportJobRequester } from 'src/engine/core-modules/import-job/types/import-job-requester.type';
import { assignMissingImportRowIds } from 'src/engine/core-modules/import-job/utils/assign-missing-import-row-ids.util';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

type ImportJobProgressUpdate = Partial<
  Pick<
    ImportJobEntity,
    | 'status'
    | 'processedRecords'
    | 'successCount'
    | 'warningCount'
    | 'failureCount'
    | 'result'
  >
>;

type CreateImportJobArgs = {
  requester: ImportJobRequester;
  workspaceMemberId: string | null;
  objectNameSingular: string;
  fileName: string | null;
  columnMappings: Record<string, unknown>;
};

@Injectable()
export class ImportJobService {
  constructor(
    @InjectWorkspaceScopedRepository(ImportJobEntity)
    private readonly importJobRepository: WorkspaceScopedRepository<ImportJobEntity>,
    @InjectMessageQueue(MessageQueue.importQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async startImportJob({
    validatedRows,
    ...args
  }: CreateImportJobArgs & {
    validatedRows: unknown;
  }): Promise<ImportJobEntity> {
    const rows = this.prepareRows(validatedRows);

    const importJob = await this.insertImportJob({
      ...args,
      validatedRows: rows,
      status: ImportJobStatus.PENDING,
    });

    await this.enqueue({
      importJobId: importJob.id,
      workspaceId: args.requester.workspaceId,
    });

    return importJob;
  }

  async createImportJob(args: CreateImportJobArgs): Promise<ImportJobEntity> {
    return this.insertImportJob({
      ...args,
      validatedRows: [],
      status: ImportJobStatus.UPLOADING,
    });
  }

  async appendImportJobRows({
    requester,
    importJobId,
    rows,
  }: {
    requester: ImportJobRequester;
    importJobId: string;
    rows: unknown;
  }): Promise<{ importJobId: string; totalRecords: number }> {
    this.assertValidImportJobIdOrThrow(importJobId);

    const preparedRows = this.prepareRows(rows);

    // Appended in SQL so the jsonb column is never loaded into server memory
    await this.importJobRepository
      .createQueryBuilder()
      .update()
      .set({
        validatedRows: () =>
          `COALESCE("validatedRows", '[]'::jsonb) || :rows::jsonb`,
        totalRecords: () => `"totalRecords" + :rowCount`,
      })
      .where('"id" = :importJobId', { importJobId })
      .andWhere('"workspaceId" = :workspaceId', {
        workspaceId: requester.workspaceId,
      })
      .andWhere('"userWorkspaceId" = :userWorkspaceId', {
        userWorkspaceId: requester.userWorkspaceId,
      })
      .andWhere('"status" = :status', { status: ImportJobStatus.UPLOADING })
      .setParameters({
        rows: JSON.stringify(preparedRows),
        rowCount: preparedRows.length,
      })
      .execute();

    const importJob = await this.findForRequesterOrThrow({
      requester,
      importJobId,
    });

    return { importJobId: importJob.id, totalRecords: importJob.totalRecords };
  }

  async finalizeImportJob({
    requester,
    importJobId,
  }: {
    requester: ImportJobRequester;
    importJobId: string;
  }): Promise<ImportJobEntity> {
    this.assertValidImportJobIdOrThrow(importJobId);

    const { affected } = await this.importJobRepository.update(
      requester.workspaceId,
      {
        id: importJobId,
        userWorkspaceId: requester.userWorkspaceId,
        status: ImportJobStatus.UPLOADING,
      },
      { status: ImportJobStatus.PENDING },
    );

    const importJob = await this.findForRequesterOrThrow({
      requester,
      importJobId,
    });

    // Only the call that moved the job out of uploading enqueues it, so a retried finalize never queues it twice
    if ((affected ?? 0) > 0) {
      await this.enqueue({ importJobId, workspaceId: requester.workspaceId });
    }

    return importJob;
  }

  async cancelImportJob({
    requester,
    importJobId,
  }: {
    requester: ImportJobRequester;
    importJobId: string;
  }): Promise<ImportJobEntity> {
    this.assertValidImportJobIdOrThrow(importJobId);

    await this.importJobRepository.update(
      requester.workspaceId,
      {
        id: importJobId,
        userWorkspaceId: requester.userWorkspaceId,
        status: In([
          ImportJobStatus.UPLOADING,
          ImportJobStatus.PENDING,
          ImportJobStatus.PROCESSING,
        ]),
      },
      { status: ImportJobStatus.CANCELLED },
    );

    return this.findForRequesterOrThrow({ requester, importJobId });
  }

  async findForRequester({
    requester,
    importJobId,
  }: {
    requester: ImportJobRequester;
    importJobId: string;
  }): Promise<ImportJobEntity | null> {
    if (!isValidUuid(importJobId)) {
      return null;
    }

    return this.importJobRepository.findOne(requester.workspaceId, {
      where: { id: importJobId, userWorkspaceId: requester.userWorkspaceId },
      select: IMPORT_JOB_SUMMARY_SELECT,
    });
  }

  async findById({
    workspaceId,
    importJobId,
  }: ImportJobData): Promise<ImportJobEntity | null> {
    return this.importJobRepository.findOneBy(workspaceId, {
      id: importJobId,
    });
  }

  async findStatusById({
    workspaceId,
    importJobId,
  }: ImportJobData): Promise<ImportJobStatus | undefined> {
    const importJob = await this.importJobRepository.findOne(workspaceId, {
      where: { id: importJobId },
      select: { id: true, status: true },
    });

    return importJob?.status;
  }

  // A conditional update, so a cancel that lands first wins and a second delivery cannot start the job again
  async claimPendingImportJob({
    workspaceId,
    importJobId,
  }: ImportJobData): Promise<boolean> {
    const { affected } = await this.importJobRepository.update(
      workspaceId,
      { id: importJobId, status: ImportJobStatus.PENDING },
      { status: ImportJobStatus.PROCESSING },
    );

    return (affected ?? 0) > 0;
  }

  async updateProgress({
    workspaceId,
    importJobId,
    updates,
  }: ImportJobData & { updates: ImportJobProgressUpdate }): Promise<void> {
    await this.importJobRepository.update(
      workspaceId,
      { id: importJobId },
      updates as QueryDeepPartialEntity<ImportJobEntity>,
    );
  }

  private async insertImportJob({
    requester,
    workspaceMemberId,
    objectNameSingular,
    fileName,
    columnMappings,
    validatedRows,
    status,
  }: CreateImportJobArgs & {
    validatedRows: Record<string, unknown>[];
    status: ImportJobStatus;
  }): Promise<ImportJobEntity> {
    return this.importJobRepository.insertAndReturnOne(requester.workspaceId, {
      userWorkspaceId: requester.userWorkspaceId,
      workspaceMemberId,
      objectNameSingular,
      fileName,
      columnMappings,
      validatedRows,
      status,
      totalRecords: validatedRows.length,
    } as QueryDeepPartialEntity<ImportJobEntity>);
  }

  private async enqueue({ importJobId, workspaceId }: ImportJobData) {
    try {
      await this.messageQueueService.add<ImportJobData>(
        IMPORT_JOB_PROCESSOR_NAME,
        { importJobId, workspaceId },
        { id: importJobId, isWorkspaceJob: true, workspaceId, retryLimit: 0 },
      );
    } catch (error) {
      // A job stuck in pending never becomes terminal, so the retention cron would never purge its rows
      await this.updateProgress({
        workspaceId,
        importJobId,
        updates: {
          status: ImportJobStatus.FAILED,
          result: {
            errors: [{ error: t`The import could not be queued. Try again.` }],
          },
        },
      });

      throw error;
    }
  }

  // Unknown ids and other users' jobs get the same error, so job ids cannot be probed
  private async findForRequesterOrThrow(args: {
    requester: ImportJobRequester;
    importJobId: string;
  }): Promise<ImportJobEntity> {
    const importJob = await this.findForRequester(args);

    if (!isDefined(importJob)) {
      throw new NotFoundException(t`Import not found.`);
    }

    return importJob;
  }

  private assertValidImportJobIdOrThrow(importJobId: string) {
    if (!isValidUuid(importJobId)) {
      throw new NotFoundException(t`Import not found.`);
    }
  }

  private prepareRows(rows: unknown): Record<string, unknown>[] {
    if (!Array.isArray(rows) || !rows.every(isPlainObject)) {
      throw new BadRequestException(t`Import rows must be a list of records.`);
    }

    return assignMissingImportRowIds(rows);
  }
}
