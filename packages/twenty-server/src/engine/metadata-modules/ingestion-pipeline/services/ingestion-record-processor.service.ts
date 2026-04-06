import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionRelationResolverService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service';
import { type IngestionError } from 'src/engine/metadata-modules/ingestion-pipeline/types/ingestion-error.type';
import { buildRecordFromMappings } from 'src/engine/metadata-modules/ingestion-pipeline/utils/build-record-from-mappings.util';
import { extractValueByPath } from 'src/engine/metadata-modules/ingestion-pipeline/utils/extract-value-by-path.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

// PostgreSQL unique_violation error code
const PG_UNIQUE_VIOLATION = '23505';

type ProcessingResult = {
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors: IngestionError[];
};

@Injectable()
export class IngestionRecordProcessorService {
  private readonly logger = new Logger(IngestionRecordProcessorService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly relationResolverService: IngestionRelationResolverService,
  ) {}

  async processRecords(
    records: Record<string, unknown>[],
    pipeline: IngestionPipelineEntity,
    mappings: IngestionFieldMappingEntity[],
    workspaceId: string,
  ): Promise<ProcessingResult> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const result: ProcessingResult = {
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
          errors: [],
        };

        const relationCache = this.relationResolverService.createCache();

        const repository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            pipeline.targetObjectNameSingular,
            { shouldBypassPermissionChecks: true },
          );

        for (let i = 0; i < records.length; i++) {
          const sourceRecord = records[i];

          try {
            // Build the CRM record from field mappings
            const mappedRecord = buildRecordFromMappings(
              sourceRecord,
              mappings,
            );

            // Resolve all relation references
            const resolvedRecord =
              await this.relationResolverService.resolveRelations(
                mappedRecord,
                workspaceId,
                relationCache,
              );

            if (isDefined(pipeline.dedupFieldName)) {
              const dedupValue = getDedupValue(
                resolvedRecord,
                pipeline.dedupFieldName,
              );

              if (isDefined(dedupValue)) {
                const saved = await this.saveWithDedup(
                  repository,
                  resolvedRecord,
                  pipeline.dedupFieldName,
                  dedupValue,
                  result,
                );

                if (saved) {
                  continue;
                }
              }
            }

            // No dedup field or no dedup value — create new record
            await repository.save(resolvedRecord);
            result.recordsCreated++;
          } catch (error) {
            result.recordsFailed++;
            result.errors.push({
              recordIndex: i,
              sourceData: sourceRecord,
              message:
                error instanceof Error ? error.message : 'Unknown error',
            });

            this.logger.warn(
              `Failed to process record ${i} for pipeline ${pipeline.id}: ${error}`,
            );
          }
        }

        return result;
      },
      authContext,
    );
  }

  /**
   * Atomically insert-or-update a record using the dedup field's unique index.
   *
   * Strategy: try INSERT first. If a unique constraint violation fires
   * (concurrent insert won the race), fall back to UPDATE by dedup field.
   * This eliminates the TOCTOU race in the old findOne + save pattern.
   */
  private async saveWithDedup(
    repository: Awaited<
      ReturnType<GlobalWorkspaceOrmManager['getRepository']>
    >,
    resolvedRecord: Record<string, unknown>,
    dedupFieldName: string,
    dedupValue: unknown,
    result: ProcessingResult,
  ): Promise<boolean> {
    const [field, subField] = dedupFieldName.includes('.')
      ? dedupFieldName.split('.')
      : [dedupFieldName, null];

    const whereClause = isDefined(subField)
      ? { [field]: { [subField]: dedupValue } }
      : { [field]: dedupValue };

    // Check for existing record first (fast path for updates)
    const existing = await repository.findOne({ where: whereClause });

    if (isDefined(existing)) {
      const existingId = (existing as Record<string, unknown>).id as string;

      await repository.update(existingId, resolvedRecord);
      result.recordsUpdated++;

      return true;
    }

    // No existing record — try to insert. The unique index on the dedup field
    // guarantees that only one concurrent insert wins; losers get a
    // unique_violation which we catch and convert to an update.
    try {
      await repository.save(resolvedRecord);
      result.recordsCreated++;

      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Another concurrent job inserted first — update instead
        const nowExisting = await repository.findOne({ where: whereClause });

        if (isDefined(nowExisting)) {
          const existingId = (nowExisting as Record<string, unknown>)
            .id as string;

          await repository.update(existingId, resolvedRecord);
          result.recordsUpdated++;

          return true;
        }
      }

      // Not a unique violation — let the outer catch handle it
      throw error;
    }
  }
}

const getDedupValue = (
  record: Record<string, unknown>,
  dedupFieldName: string,
): unknown => {
  if (dedupFieldName.includes('.')) {
    return extractValueByPath(record, dedupFieldName);
  }

  return record[dedupFieldName];
};

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code: string }).code === PG_UNIQUE_VIOLATION;
  }

  // TypeORM sometimes wraps the underlying PG error
  if (error instanceof Error && 'driverError' in error) {
    const driverError = (error as unknown as { driverError: { code: string } })
      .driverError;

    return driverError?.code === PG_UNIQUE_VIOLATION;
  }

  return false;
};
