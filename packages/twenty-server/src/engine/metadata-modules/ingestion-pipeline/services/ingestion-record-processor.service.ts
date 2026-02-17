import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionRelationResolverService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service';
import { type IngestionError } from 'src/engine/metadata-modules/ingestion-pipeline/types/ingestion-error.type';
import { buildRecordFromMappings } from 'src/engine/metadata-modules/ingestion-pipeline/utils/build-record-from-mappings.util';
import { extractValueByPath } from 'src/engine/metadata-modules/ingestion-pipeline/utils/extract-value-by-path.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

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
    const result: ProcessingResult = {
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
    };

    const relationCache = this.relationResolverService.createCache();

    const repository = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      pipeline.targetObjectNameSingular,
      { shouldBypassPermissionChecks: true },
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
            workspaceId,
            relationCache,
          );

        // Check for dedup match
        if (isDefined(pipeline.dedupFieldName)) {
          const dedupValue = getDedupValue(
            resolvedRecord,
            pipeline.dedupFieldName,
          );

          if (isDefined(dedupValue)) {
            const [field, subField] = pipeline.dedupFieldName.includes('.')
              ? pipeline.dedupFieldName.split('.')
              : [pipeline.dedupFieldName, null];

            const whereClause = isDefined(subField)
              ? { [field]: { [subField]: dedupValue } }
              : { [field]: dedupValue };

            const existing = await repository.findOne({
              where: whereClause,
            });

            if (isDefined(existing)) {
              const existingId = (existing as Record<string, unknown>)
                .id as string;

              await repository.update(existingId, resolvedRecord);
              result.recordsUpdated++;
              continue;
            }
          }
        }

        // Create new record
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
