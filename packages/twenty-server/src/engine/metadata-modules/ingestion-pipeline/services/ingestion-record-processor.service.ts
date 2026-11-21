import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionRelationResolverService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service';
import { type IngestionError } from 'src/engine/metadata-modules/ingestion-pipeline/types/ingestion-error.type';
import { buildRecordFromMappings } from 'src/engine/metadata-modules/ingestion-pipeline/utils/build-record-from-mappings.util';
import { extractValueByPath } from 'src/engine/metadata-modules/ingestion-pipeline/utils/extract-value-by-path.util';
import { getIngestionErrorLogLabel } from 'src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-error-log-label.util';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { isDuplicateEntryError } from 'src/engine/twenty-orm/utils/is-duplicate-entry-error.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

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
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly relationResolverService: IngestionRelationResolverService,
  ) {}

  async processRecords(
    records: Record<string, unknown>[],
    pipeline: IngestionPipelineEntity,
    mappings: IngestionFieldMappingEntity[],
    workspaceId: string,
  ): Promise<ProcessingResult> {
    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const result: ProcessingResult = {
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        errors: [],
      };

      const relationCache = this.relationResolverService.createCache();

      // Ingestion writes as the system; the settings user only configures the pipeline
      const repository =
        this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
          pipeline.targetObjectNameSingular,
        );

      for (let i = 0; i < records.length; i++) {
        const sourceRecord = records[i];

        try {
          // Build the CRM record from field mappings
          const mappedRecord = buildRecordFromMappings(sourceRecord, mappings);

          // Resolve all relation references
          const resolvedRecord =
            await this.relationResolverService.resolveRelations(
              mappedRecord,
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
            message: error instanceof Error ? error.message : 'Unknown error',
          });

          this.logger.warn(
            `Failed to process record ${i} for pipeline ${pipeline.id}: ${getIngestionErrorLogLabel(error)}`,
          );
        }
      }

      return result;
    }, buildSystemAuthContext(workspaceId));
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
    repository: WorkspaceRepository,
    resolvedRecord: Record<string, unknown>,
    whereClause: Record<string, unknown>,
    result: ProcessingResult,
  ): Promise<boolean> {
    // Check for existing record first (fast path for updates)
    const existing = await repository.findOne({ where: whereClause });

    if (isDefined(existing)) {
      await repository.update(existing.id, resolvedRecord);
      result.recordsUpdated++;

      return true;
    }

    // No existing record — try to insert. The unique index on the dedup field
    // guarantees that only one concurrent insert wins; losers get a
    // duplicate-entry error which we catch and convert to an update.
    try {
      await repository.save(resolvedRecord);
      result.recordsCreated++;

      return true;
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        // Another concurrent job inserted first — update instead
        const nowExisting = await repository.findOne({ where: whereClause });

        if (isDefined(nowExisting)) {
          await repository.update(nowExisting.id, resolvedRecord);
          result.recordsUpdated++;

          return true;
        }
      }

      // Not a duplicate entry — let the outer catch handle it
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
