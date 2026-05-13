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

            if (
              isDefined(pipeline.dedupFieldNames) &&
              pipeline.dedupFieldNames.length > 0
            ) {
              const whereClause = buildDedupWhereClause(
                resolvedRecord,
                pipeline.dedupFieldNames,
              );

              if (isDefined(whereClause)) {
                const saved = await this.saveWithDedup(
                  repository,
                  resolvedRecord,
                  whereClause,
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
   * Atomically insert-or-update a record using the dedup unique index.
   *
   * Strategy: try INSERT first. If a unique constraint violation fires
   * (concurrent insert won the race), fall back to UPDATE matching the
   * dedup WHERE clause. Eliminates the TOCTOU race in the old findOne +
   * save pattern. The WHERE clause may be a single field or a composite
   * AND of several fields (e.g. (agents.id, date) for Time Cards).
   */
  private async saveWithDedup(
    repository: Awaited<
      ReturnType<GlobalWorkspaceOrmManager['getRepository']>
    >,
    resolvedRecord: Record<string, unknown>,
    whereClause: Record<string, unknown>,
    result: ProcessingResult,
  ): Promise<boolean> {
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

// Build a TypeORM-shaped WHERE object from N dedup fields. Returns null
// if any required value is undefined — we won't try to upsert against a
// partial natural key.
const buildDedupWhereClause = (
  record: Record<string, unknown>,
  dedupFieldNames: string[],
): Record<string, unknown> | null => {
  const where: Record<string, unknown> = {};

  for (const fieldName of dedupFieldNames) {
    const value = getDedupValue(record, fieldName);

    if (!isDefined(value)) {
      return null;
    }

    const [field, subField] = fieldName.includes('.')
      ? fieldName.split('.')
      : [fieldName, null];

    if (isDefined(subField)) {
      const existing = (where[field] as Record<string, unknown>) ?? {};

      where[field] = { ...existing, [subField]: value };
    } else {
      where[field] = value;
    }
  }

  return where;
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
