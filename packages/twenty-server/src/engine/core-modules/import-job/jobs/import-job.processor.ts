import { ForbiddenException, Logger, Scope } from '@nestjs/common';

import { plural, t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { PermissionFlagType, QUERY_MAX_RECORDS } from 'twenty-shared/constants';
import { FieldActorSource } from 'twenty-shared/types';
import { isDefined, isPlainObject } from 'twenty-shared/utils';
import { In } from 'typeorm';
import { v4 } from 'uuid';

import { ActorFromAuthContextService } from 'src/engine/core-modules/actor/services/actor-from-auth-context.service';
import { AuthException } from 'src/engine/core-modules/auth/auth.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { IMPORT_JOB_PROCESSOR_NAME } from 'src/engine/core-modules/import-job/constants/import-job-processor-name.constant';
import { type ImportJobEntity } from 'src/engine/core-modules/import-job/entities/import-job.entity';
import { ImportJobStatus } from 'src/engine/core-modules/import-job/enums/import-job-status.enum';
import { ImportJobService } from 'src/engine/core-modules/import-job/import-job.service';
import { type ImportJobData } from 'src/engine/core-modules/import-job/types/import-job-data.type';
import {
  type RelatedRecordUpdate,
  type RelationBehavior,
  type RelationResolutionError,
  type RelationResolutionPlan,
} from 'src/engine/core-modules/import-job/utils/relation-resolution.types';
import { resolveImportRelations } from 'src/engine/core-modules/import-job/utils/resolve-import-relations.util';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { UserWorkspaceAuthContextService } from 'src/engine/core-modules/user-workspace/services/user-workspace-auth-context.service';
import { SettingPermissionsService } from 'src/engine/permissions/setting-permissions.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const INTER_BATCH_DELAY_MS = 500;
const RELATION_UPDATE_CONCURRENCY = 10;

type ImportRow = Record<string, unknown>;

@Processor({ queueName: MessageQueue.importQueue, scope: Scope.REQUEST })
export class ImportJobProcessor {
  private readonly logger = new Logger(ImportJobProcessor.name);

  constructor(
    private readonly importJobService: ImportJobService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly userWorkspaceAuthContextService: UserWorkspaceAuthContextService,
    private readonly settingPermissionsService: SettingPermissionsService,
    private readonly actorFromAuthContextService: ActorFromAuthContextService,
  ) {}

  @Process(IMPORT_JOB_PROCESSOR_NAME)
  async handle(data: ImportJobData): Promise<void> {
    const { importJobId } = data;

    this.logger.log(`Starting import job ${importJobId}`);

    const importJob = await this.importJobService.findById(data);

    if (!isDefined(importJob)) {
      this.logger.error(`Import job ${importJobId} not found`);

      return;
    }

    if (importJob.status === ImportJobStatus.CANCELLED) {
      this.logger.log(`Import job ${importJobId} was cancelled before start`);

      return;
    }

    // Only a stalled or crashed worker hands the job back while it is processing (maxStalledCount 1);
    // a re-run would start again from row 0, so the job fails instead
    if (importJob.status === ImportJobStatus.PROCESSING) {
      this.logger.error(
        `Import job ${importJobId} was redelivered while processing; marking it failed`,
      );

      await this.failImportJob(
        data,
        t`The import worker restarted while processing this import; re-run the import.`,
      );

      return;
    }

    if (importJob.status !== ImportJobStatus.PENDING) {
      this.logger.log(
        `Import job ${importJobId} is already ${importJob.status}; nothing to do`,
      );

      return;
    }

    if (!(await this.importJobService.claimPendingImportJob(data))) {
      this.logger.log(
        `Import job ${importJobId} was cancelled or claimed by another delivery before start`,
      );

      return;
    }

    let authContext: WorkspaceAuthContext;

    try {
      authContext = await this.resolveRequesterOrThrow(importJob);
    } catch (error) {
      this.logger.warn(
        `Import job ${importJobId} failed: its requester could not be verified`,
      );

      await this.failImportJob(
        data,
        error instanceof ForbiddenException
          ? error.message
          : t`The import could not start. Re-run the import.`,
      );

      return;
    }

    await this.runImport({ importJob, authContext });
  }

  // Membership, role and IMPORT_CSV can change after the upload or mid-run, so they are checked before every write
  private async resolveRequesterOrThrow({
    workspaceId,
    userWorkspaceId,
  }: ImportJobEntity): Promise<WorkspaceAuthContext> {
    if (!isDefined(userWorkspaceId)) {
      throw new ForbiddenException(
        t`This import has no requester. Re-run the import.`,
      );
    }

    let authContext: WorkspaceAuthContext;

    try {
      authContext = await this.userWorkspaceAuthContextService.resolve({
        workspaceId,
        userWorkspaceId,
      });
    } catch (error) {
      if (error instanceof AuthException) {
        throw new ForbiddenException(
          t`The import requester is no longer a workspace member.`,
        );
      }

      throw error;
    }

    const canImport = await this.settingPermissionsService.hasPermissionFlag({
      authContext,
      permissionFlag: PermissionFlagType.IMPORT_CSV,
    });

    if (!canImport) {
      throw new ForbiddenException(
        t`You do not have permission to import records.`,
      );
    }

    return authContext;
  }

  private async runImport({
    importJob,
    authContext,
  }: {
    importJob: ImportJobEntity;
    authContext: WorkspaceAuthContext;
  }): Promise<void> {
    const jobData: ImportJobData = {
      importJobId: importJob.id,
      workspaceId: importJob.workspaceId,
    };
    const { importJobId } = jobData;

    let validatedRows: ImportRow[] = importJob.validatedRows ?? [];
    const totalRecords = validatedRows.length;
    let processedRecords = 0;
    let successCount = 0;
    let failureCount = 0;
    const allWarnings: RelationResolutionError[] = [];
    const allErrors: Record<string, unknown>[] = [];

    try {
      const relationBehaviors = (importJob.columnMappings?.relationBehaviors ??
        []) as RelationBehavior[];
      const hasRelationResolution = relationBehaviors.some(
        (relationBehavior) => relationBehavior.behavior !== 'SKIP',
      );

      if (hasRelationResolution) {
        this.logger.log(
          `Resolving ${relationBehaviors.length} relation behaviors for ${totalRecords} rows`,
        );

        await this.importJobService.updateProgress({
          ...jobData,
          updates: { result: { phase: t`Resolving relations...` } },
        });

        const plan = await this.workspaceOrmManager.executeInWorkspaceContext(
          () =>
            this.resolveRelations({
              importJob,
              validatedRows,
              relationBehaviors,
            }),
          authContext,
        );

        // All-or-nothing: one unresolved relation fails the whole job before any write
        if (plan.errors.length > 0) {
          this.logger.warn(
            `Import job ${importJobId}: relation resolution failed with ${plan.errors.length} errors`,
          );

          await this.importJobService.updateProgress({
            ...jobData,
            updates: {
              status: ImportJobStatus.FAILED,
              processedRecords: totalRecords,
              failureCount: plan.errors.length,
              result: { errors: plan.errors },
            },
          });

          return;
        }

        // Resolution can take minutes, so a cancel during it must stop the job before its first write
        if (await this.isCancelled(jobData)) {
          this.logger.log(
            `Import job ${importJobId} cancelled during relation resolution`,
          );

          return;
        }

        const relationPlanAuthContext =
          await this.resolveRequesterOrThrow(importJob);

        await this.workspaceOrmManager.executeInWorkspaceContext(
          () =>
            this.applyRelationPlan({
              plan,
              authContext: relationPlanAuthContext,
            }),
          relationPlanAuthContext,
        );

        this.logger.log(
          `Relation resolution complete: ${plan.relatedRecordUpdates.length} updates, ${plan.reassignments.length} reassignments, ${plan.newRecords.length} new records`,
        );

        validatedRows = plan.processedRows;
        allWarnings.push(...plan.warnings);
      }

      await this.importJobService.updateProgress({
        ...jobData,
        updates: { result: { phase: t`Importing records...` } },
      });

      const numberOfBatches = Math.ceil(
        validatedRows.length / QUERY_MAX_RECORDS,
      );

      for (let batchIndex = 0; batchIndex < numberOfBatches; batchIndex++) {
        if (await this.isCancelled(jobData)) {
          this.logger.log(
            `Import job ${importJobId} cancelled at batch ${batchIndex}`,
          );
          break;
        }

        // A fresh context per batch, so a removed member, a new role or a revoked IMPORT_CSV stops the next write
        const batchAuthContext = await this.resolveRequesterOrThrow(importJob);

        const batchStart = batchIndex * QUERY_MAX_RECORDS;
        const batchRows = validatedRows.slice(
          batchStart,
          batchStart + QUERY_MAX_RECORDS,
        );

        try {
          const writtenCount =
            await this.workspaceOrmManager.executeInWorkspaceContext(
              () =>
                this.writeBatch({
                  rows: batchRows,
                  objectNameSingular: importJob.objectNameSingular,
                  authContext: batchAuthContext,
                }),
              batchAuthContext,
            );
          const skippedCount = batchRows.length - writtenCount;

          successCount += writtenCount;

          if (skippedCount > 0) {
            failureCount += skippedCount;
            allErrors.push({
              batchIndex,
              error: t`${plural(skippedCount, { one: '# record', other: '# records' })} could not be updated. You may not have permission to edit them.`,
            });
          }
        } catch (error) {
          failureCount += batchRows.length;
          allErrors.push({
            batchIndex,
            error: error instanceof Error ? error.message : t`Unknown error`,
          });
        }

        processedRecords = Math.min(
          batchStart + batchRows.length,
          totalRecords,
        );

        await this.importJobService.updateProgress({
          ...jobData,
          updates: {
            processedRecords,
            successCount,
            warningCount: allWarnings.length,
            failureCount,
          },
        });

        // Gives workers time to drain the event cascade of one batch before the next arrives
        if (batchIndex < numberOfBatches - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, INTER_BATCH_DELAY_MS),
          );
        }
      }

      const finalStatus = (await this.isCancelled(jobData))
        ? ImportJobStatus.CANCELLED
        : failureCount === totalRecords
          ? ImportJobStatus.FAILED
          : ImportJobStatus.COMPLETED;

      await this.importJobService.updateProgress({
        ...jobData,
        updates: {
          status: finalStatus,
          processedRecords,
          successCount,
          warningCount: allWarnings.length,
          failureCount,
          result: { warnings: allWarnings, errors: allErrors },
        },
      });

      this.logger.log(
        `Import job ${importJobId} ${finalStatus}: ${successCount} success, ${allWarnings.length} warnings, ${failureCount} failures`,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        this.logger.warn(
          `Import job ${importJobId} stopped: its requester lost access`,
        );
      } else {
        this.logger.error(`Import job ${importJobId} failed unexpectedly`);
      }

      await this.importJobService.updateProgress({
        ...jobData,
        updates: {
          status: ImportJobStatus.FAILED,
          result: {
            warnings: allWarnings,
            errors: [
              ...allErrors,
              {
                error:
                  error instanceof Error ? error.message : t`Unexpected error`,
              },
            ],
          },
        },
      });
    }
  }

  // insert() emits CREATED and updateMany() emits UPDATED with a before/after diff, so a re-import
  // leaves timeline history; a blind upsert would not
  private async writeBatch({
    rows,
    objectNameSingular,
    authContext,
  }: {
    rows: ImportRow[];
    objectNameSingular: string;
    authContext: WorkspaceAuthContext;
  }): Promise<number> {
    const repository =
      this.workspaceOrmManager.getRepository(objectNameSingular);
    const batchIds = rows.map((row) => row.id).filter(isNonEmptyString);

    const existingRecords =
      batchIds.length > 0
        ? await repository.find({
            where: { id: In(batchIds) },
            select: { id: true },
          })
        : [];

    const existingIds = new Set(existingRecords.map((record) => record.id));

    const rowsToInsert = rows.filter(
      (row) => !isNonEmptyString(row.id) || !existingIds.has(row.id),
    );
    const rowsToUpdate = rows.filter(
      (row): row is ImportRow & { id: string } =>
        isNonEmptyString(row.id) && existingIds.has(row.id),
    );

    let writtenCount = 0;

    if (rowsToInsert.length > 0) {
      const { identifiers } = await repository.insert(
        await this.injectImportActorFieldsOnCreate({
          records: rowsToInsert,
          objectNameSingular,
          authContext,
        }),
      );

      writtenCount += identifiers.length;
    }

    if (rowsToUpdate.length > 0) {
      // As in an upstream upsert, an update never rewrites who created the record
      const partialEntities =
        await this.actorFromAuthContextService.injectUpdatedBy({
          records: rowsToUpdate.map(
            ({ id: _id, createdBy: _createdBy, ...fields }) => fields,
          ),
          objectMetadataNameSingular: objectNameSingular,
          authContext,
        });

      // updateMany skips records the requester cannot edit, so only the affected count is a success
      const { affected } = await repository.updateMany(
        rowsToUpdate.map((row, index) => ({
          criteria: row.id,
          partialEntity: partialEntities[index],
        })),
      );

      writtenCount += affected ?? 0;
    }

    return writtenCount;
  }

  private async applyRelationPlan({
    plan,
    authContext,
  }: {
    plan: RelationResolutionPlan;
    authContext: WorkspaceAuthContext;
  }): Promise<void> {
    // The id is fixed before the insert: reading the record back could be denied by RLS
    for (const newRecord of plan.newRecords) {
      const newRecordId = v4();
      const recordsToInsert = await this.injectImportActorFieldsOnCreate({
        records: [{ ...newRecord.data, id: newRecordId }],
        objectNameSingular: newRecord.objectNameSingular,
        authContext,
      });

      await this.workspaceOrmManager
        .getRepository(newRecord.objectNameSingular)
        .insert(recordsToInsert);

      for (const row of plan.processedRows) {
        if (row.id === newRecord.reassignment.mainRecordId) {
          row[newRecord.reassignment.joinColumnName] = newRecordId;
        }
      }
    }

    const updatesByObject = new Map<string, RelatedRecordUpdate[]>();

    for (const update of plan.relatedRecordUpdates) {
      const group = updatesByObject.get(update.objectNameSingular) ?? [];

      group.push(update);
      updatesByObject.set(update.objectNameSingular, group);
    }

    for (const [objectNameSingular, updates] of updatesByObject.entries()) {
      const repository =
        this.workspaceOrmManager.getRepository(objectNameSingular);
      const fieldsWithUpdatedBy =
        await this.actorFromAuthContextService.injectUpdatedBy({
          records: updates.map((update) => update.fields),
          objectMetadataNameSingular: objectNameSingular,
          authContext,
        });

      // Bounded concurrency keeps a large plan from exhausting the connection pool
      for (
        let chunkStart = 0;
        chunkStart < updates.length;
        chunkStart += RELATION_UPDATE_CONCURRENCY
      ) {
        await Promise.all(
          updates
            .slice(chunkStart, chunkStart + RELATION_UPDATE_CONCURRENCY)
            .map((update, offset) =>
              repository.update(
                update.recordId,
                fieldsWithUpdatedBy[chunkStart + offset],
              ),
            ),
        );
      }
    }
  }

  // createdBy keeps source IMPORT, as in the browser import; a row that brings its own createdBy keeps it
  private async injectImportActorFieldsOnCreate({
    records,
    objectNameSingular,
    authContext,
  }: {
    records: ImportRow[];
    objectNameSingular: string;
    authContext: WorkspaceAuthContext;
  }): Promise<ImportRow[]> {
    const recordsWithActors =
      await this.actorFromAuthContextService.injectActorFieldsOnCreate({
        records,
        objectMetadataNameSingular: objectNameSingular,
        authContext,
      });

    return recordsWithActors.map((record, index) =>
      isDefined(records[index].createdBy) || !isPlainObject(record.createdBy)
        ? record
        : {
            ...record,
            createdBy: { ...record.createdBy, source: FieldActorSource.IMPORT },
          },
    );
  }

  private async resolveRelations({
    importJob,
    validatedRows,
    relationBehaviors,
  }: {
    importJob: ImportJobEntity;
    validatedRows: ImportRow[];
    relationBehaviors: RelationBehavior[];
  }): Promise<RelationResolutionPlan> {
    const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(importJob.workspaceId, [
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
      ]);

    return resolveImportRelations(
      validatedRows,
      relationBehaviors,
      importJob.objectNameSingular,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      async (objectName) => this.workspaceOrmManager.getRepository(objectName),
    );
  }

  private async isCancelled(data: ImportJobData): Promise<boolean> {
    return (
      (await this.importJobService.findStatusById(data)) ===
      ImportJobStatus.CANCELLED
    );
  }

  private async failImportJob(
    data: ImportJobData,
    errorMessage: string,
  ): Promise<void> {
    await this.importJobService.updateProgress({
      ...data,
      updates: {
        status: ImportJobStatus.FAILED,
        result: { errors: [{ error: errorMessage }] },
      },
    });
  }
}
