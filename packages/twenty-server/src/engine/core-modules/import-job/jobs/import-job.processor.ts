import { Logger, Scope } from '@nestjs/common';

import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  ImportJobService,
  IMPORT_JOB_PROCESSOR_NAME,
  type ImportJobData,
} from 'src/engine/core-modules/import-job/import-job.service';
import { ImportJobStatus } from 'src/engine/core-modules/import-job/enums/import-job-status.enum';
import { type RelationBehavior } from 'src/engine/core-modules/import-job/utils/relation-resolution.types';
import { resolveImportRelations } from 'src/engine/core-modules/import-job/utils/resolve-import-relations.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const BATCH_SIZE = 200;
const INTER_BATCH_DELAY_MS = 500;

@Processor({ queueName: MessageQueue.importQueue, scope: Scope.REQUEST })
export class ImportJobProcessor {
  private readonly logger = new Logger(ImportJobProcessor.name);

  constructor(
    private readonly importJobService: ImportJobService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  @Process(IMPORT_JOB_PROCESSOR_NAME)
  async handle(data: ImportJobData): Promise<void> {
    const { importJobId, workspaceId } = data;

    this.logger.log(`Starting import job ${importJobId}`);

    const importJob = await this.importJobService.getImportJob(
      importJobId,
      workspaceId,
    );

    if (!importJob) {
      this.logger.error(`Import job ${importJobId} not found`);

      return;
    }

    if (importJob.status === ImportJobStatus.CANCELLED) {
      this.logger.log(`Import job ${importJobId} was cancelled before start`);

      return;
    }

    await this.importJobService.updateProgress(importJobId, {
      status: ImportJobStatus.PROCESSING,
    });

    let validatedRows = importJob.validatedRows ?? [];
    const totalRecords = validatedRows.length;
    let processedRecords = 0;
    let successCount = 0;
    let warningCount = 0;
    let failureCount = 0;
    const allWarnings: Record<string, unknown>[] = [];
    const allErrors: Record<string, unknown>[] = [];
    let relationResolutionHandledStatus = false;

    try {
      const authContext = buildSystemAuthContext(workspaceId);

      // Check if this import includes relation sub-field data
      const columnMappings = importJob.columnMappings as Record<
        string,
        unknown
      > | null;
      const relationBehaviors = (
        columnMappings?.relationBehaviors ?? []
      ) as RelationBehavior[];
      const hasRelationResolution =
        relationBehaviors.length > 0 &&
        relationBehaviors.some((rb) => rb.behavior !== 'SKIP');

      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          // Event emission policy: only emit CREATED (skip duplicate
          // UPSERTED), and tag events with 'import' origin so downstream
          // listeners can skip webhook/trigger orchestrator jobs that
          // would otherwise create 200k+ jobs for large imports.
          // ── Relation Resolution (pre-processing) ──────────────
          if (hasRelationResolution) {
            this.logger.log(
              `Resolving ${relationBehaviors.length} relation behaviors for ${totalRecords} rows`,
            );

            await this.importJobService.updateProgress(importJobId, {
              result: { phase: 'Resolving relations...' },
            });

            const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
              await this.workspaceCacheService.getOrRecompute(workspaceId, [
                'flatObjectMetadataMaps',
                'flatFieldMetadataMaps',
              ]);

            const getRepository = async (objectName: string) =>
              this.globalWorkspaceOrmManager.getRepository(
                workspaceId,
                objectName,
                { shouldBypassPermissionChecks: true },
              );

            const plan = await resolveImportRelations(
              validatedRows,
              relationBehaviors,
              importJob.objectNameSingular,
              flatObjectMetadataMaps,
              flatFieldMetadataMaps,
              getRepository,
            );

            // All-or-nothing: if any resolution errors, fail the job
            if (plan.errors.length > 0) {
              this.logger.warn(
                `Relation resolution failed with ${plan.errors.length} errors: ${JSON.stringify(plan.errors)}`,
              );

              relationResolutionHandledStatus = true;

              await this.importJobService.updateProgress(importJobId, {
                status: ImportJobStatus.FAILED,
                processedRecords: totalRecords,
                failureCount: plan.errors.length,
                result: { errors: plan.errors },
              });

              return;
            }

            // Apply relation changes before main record upsert

            // 1. Create new related records (and capture their IDs)
            for (const newRecord of plan.newRecords) {
              const repo = await getRepository(
                newRecord.objectNameSingular,
              );
              const created = (await repo.save(
                newRecord.data,
              )) as Record<string, unknown>;

              if (typeof created.id === 'string') {
                // Apply the pending reassignment to the processed rows
                for (const row of plan.processedRows) {
                  if (
                    row.id === newRecord.reassignment.mainRecordId
                  ) {
                    row[newRecord.reassignment.joinColumnName] =
                      created.id;
                  }
                }
              }
            }

            // 2. Update existing related records
            for (const update of plan.relatedRecordUpdates) {
              const repo = await getRepository(
                update.objectNameSingular,
              );

              await repo.update(update.recordId, update.fields);
            }

            this.logger.log(
              `Relation resolution complete: ${plan.relatedRecordUpdates.length} updates, ${plan.reassignments.length} reassignments, ${plan.newRecords.length} new records`,
            );

            // Use the processed rows (direct fields only, FKs resolved)
            validatedRows = plan.processedRows;
          }

          // ── Batch Upsert ──────────────────────────────────────
          await this.importJobService.updateProgress(importJobId, {
            result: { phase: 'Importing records...' },
          });

          const repository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              importJob.objectNameSingular,
              { shouldBypassPermissionChecks: true },
            );

          const numberOfBatches = Math.ceil(
            validatedRows.length / BATCH_SIZE,
          );

          for (
            let batchIndex = 0;
            batchIndex < numberOfBatches;
            batchIndex++
          ) {
            // Check for cancellation between batches
            const currentJob = await this.importJobService.getImportJob(
              importJobId,
              workspaceId,
            );

            if (currentJob?.status === ImportJobStatus.CANCELLED) {
              this.logger.log(
                `Import job ${importJobId} cancelled at batch ${batchIndex}`,
              );
              break;
            }

            const batchStart = batchIndex * BATCH_SIZE;
            const batchRows = validatedRows.slice(
              batchStart,
              batchStart + BATCH_SIZE,
            );

            try {
              await repository.upsert(batchRows, ['id']);
              successCount += batchRows.length;
            } catch (error: unknown) {
              if (
                error instanceof Error &&
                'code' in error &&
                (error as Record<string, unknown>).code ===
                  'IMPORT_PARTIAL_SUCCESS'
              ) {
                const errorObj = error as Record<string, unknown>;
                const savedCount =
                  (errorObj.savedRecordCount as number) ??
                  batchRows.length;
                const warnings =
                  (errorObj.importWarnings as Record<
                    string,
                    unknown
                  >[]) ?? [];

                successCount += savedCount;
                warningCount += warnings.length;
                allWarnings.push(...warnings);
              } else {
                failureCount += batchRows.length;
                allErrors.push({
                  batchIndex,
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Unknown error',
                });
              }
            }

            processedRecords = Math.min(
              batchStart + batchRows.length,
              totalRecords,
            );

            await this.importJobService.updateProgress(importJobId, {
              processedRecords,
              successCount,
              warningCount,
              failureCount,
            });

            // Space out batches so workers can process the event cascade
            // from each batch before the next wave arrives
            if (batchIndex < numberOfBatches - 1) {
              await new Promise((resolve) =>
                setTimeout(resolve, INTER_BATCH_DELAY_MS),
              );
            }
          }
        },
        authContext,
        {
          eventEmissionPolicy: {
            allowedActions: [DatabaseEventAction.CREATED],
            origin: 'import',
          },
        },
      );

      // If relation resolution already set the final status, don't overwrite
      if (relationResolutionHandledStatus) {
        return;
      }

      // Determine final status
      const finalJob = await this.importJobService.getImportJob(
        importJobId,
        workspaceId,
      );

      const finalStatus =
        finalJob?.status === ImportJobStatus.CANCELLED
          ? ImportJobStatus.CANCELLED
          : failureCount === totalRecords
            ? ImportJobStatus.FAILED
            : ImportJobStatus.COMPLETED;

      await this.importJobService.updateProgress(importJobId, {
        status: finalStatus,
        processedRecords,
        successCount,
        warningCount,
        failureCount,
        result: {
          warnings: allWarnings,
          errors: allErrors,
        },
      });

      this.logger.log(
        `Import job ${importJobId} ${finalStatus}: ${successCount} success, ${warningCount} warnings, ${failureCount} failures`,
      );
    } catch (error) {
      this.logger.error(
        `Import job ${importJobId} failed unexpectedly: ${error}`,
      );

      await this.importJobService.updateProgress(importJobId, {
        status: ImportJobStatus.FAILED,
        result: {
          warnings: allWarnings,
          errors: [
            ...allErrors,
            {
              error:
                error instanceof Error ? error.message : 'Unexpected error',
            },
          ],
        },
      });
    }
  }
}
