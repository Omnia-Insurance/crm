import { Logger, Scope } from '@nestjs/common';

import {
  FieldMetadataType,
  type FieldMetadataSettingsMapping,
  FileFolder,
} from 'twenty-shared/types';

import { GraphqlQueryParser } from 'src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/graphql-query.parser';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  ExportJobService,
  EXPORT_JOB_PROCESSOR_NAME,
  type ExportJobData,
} from 'src/engine/core-modules/export-job/export-job.service';
import { ExportJobStatus } from 'src/engine/core-modules/export-job/enums/export-job-status.enum';
import {
  COMPOSITE_FIELD_SUB_FIELD_LABELS,
  isCompositeFieldType,
} from 'src/engine/core-modules/export-job/utils/composite-field-labels.constant';
import { FileStorageService } from 'src/engine/core-modules/file-storage/file-storage.service';
import { FileUrlService } from 'src/engine/core-modules/file/file-url/file-url.service';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { normalizeUsState } from 'src/engine/core-modules/export-job/utils/normalize-us-state.util';
import { json2csv } from 'json-2-csv';

const BATCH_SIZE = 500;
const RELATION_BATCH_SIZE = 200;
const RELATION_FETCH_CONCURRENCY = 5;
const CANCELLATION_CHECK_INTERVAL = 5; // Check every N batches

type RelationConfig = {
  relationFieldName: string;
  relationFieldLabel: string;
  targetObjectNameSingular: string;
  selectedFieldPaths: string[];
};

type ExportColumn = {
  fieldName: string;
  label: string;
  type: string;
};

type CsvColumn = {
  field: string;
  title: string;
};

/**
 * Pre-built index for fast field metadata lookups.
 * Avoids O(n) scans over flat metadata maps on every call.
 */
type MetadataIndex = {
  fieldByObjectAndName: Map<string, FlatFieldMetadata>;
  objectByName: Map<string, FlatObjectMetadata>;
  objectById: Map<string, FlatObjectMetadata>;
  fieldsByObjectId: Map<string, FlatFieldMetadata[]>;
};

function buildMetadataIndex(
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
): MetadataIndex {
  const fieldByObjectAndName = new Map<string, FlatFieldMetadata>();
  const objectByName = new Map<string, FlatObjectMetadata>();
  const objectById = new Map<string, FlatObjectMetadata>();
  const fieldsByObjectId = new Map<string, FlatFieldMetadata[]>();

  for (const obj of Object.values(
    flatObjectMetadataMaps.byUniversalIdentifier,
  ) as (FlatObjectMetadata | undefined)[]) {
    if (!obj) continue;
    objectByName.set(obj.nameSingular, obj);
    objectById.set(obj.id, obj);
  }

  for (const field of Object.values(
    flatFieldMetadataMaps.byUniversalIdentifier,
  ) as (FlatFieldMetadata | undefined)[]) {
    if (!field) continue;

    const obj = objectById.get(field.objectMetadataId);

    if (obj) {
      fieldByObjectAndName.set(`${obj.nameSingular}.${field.name}`, field);
    }

    const existing = fieldsByObjectId.get(field.objectMetadataId) ?? [];

    existing.push(field);
    fieldsByObjectId.set(field.objectMetadataId, existing);
  }

  return { fieldByObjectAndName, objectByName, objectById, fieldsByObjectId };
}

/**
 * Resolve a FlatFieldMetadata by object name + field name using
 * the pre-built metadata index (O(1) lookup).
 */
function findFieldMetadata(
  objectNameSingular: string,
  fieldName: string,
  _flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
  _flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
  metadataIndex?: MetadataIndex,
): FlatFieldMetadata | undefined {
  if (metadataIndex) {
    return metadataIndex.fieldByObjectAndName.get(
      `${objectNameSingular}.${fieldName}`,
    );
  }

  // Fallback for callers without index (should not happen in practice)
  const objectMetadata = Object.values(
    _flatObjectMetadataMaps.byUniversalIdentifier,
  ).find((m) => m?.nameSingular === objectNameSingular);

  if (!objectMetadata) return undefined;

  return Object.values(_flatFieldMetadataMaps.byUniversalIdentifier).find(
    (f) => f?.objectMetadataId === objectMetadata.id && f?.name === fieldName,
  );
}

/**
 * For a given field path on a target object (e.g. "leadSource.name"),
 * resolve the chain of labels and the final field type.
 *
 * Returns { label, fieldType, subObjectName } where:
 *   label = "Lead Source / Name"
 *   fieldType = the FieldMetadataType of the leaf field
 *   subObjectName = the object name at the leaf level (for composite expansion)
 */
function resolveFieldPathMetadata(
  targetObjectNameSingular: string,
  fieldPath: string,
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
  metadataIndex?: MetadataIndex,
): { label: string; fieldType: FieldMetadataType } | undefined {
  const segments = fieldPath.split('.');
  const labels: string[] = [];
  let currentObjectName = targetObjectNameSingular;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLeaf = i === segments.length - 1;

    const fieldMeta = findFieldMetadata(
      currentObjectName,
      segment,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      metadataIndex,
    );

    if (!fieldMeta) {
      labels.push(segment);

      if (!isLeaf) {
        return undefined;
      }

      return { label: labels.join(' / '), fieldType: FieldMetadataType.TEXT };
    }

    labels.push(fieldMeta.label);

    if (isLeaf) {
      return {
        label: labels.join(' / '),
        fieldType: fieldMeta.type as FieldMetadataType,
      };
    }

    if (fieldMeta.type !== FieldMetadataType.RELATION) {
      return undefined;
    }

    const targetObjectId = fieldMeta.relationTargetObjectMetadataId;

    if (!targetObjectId) return undefined;

    const targetObject = metadataIndex
      ? metadataIndex.objectById.get(targetObjectId)
      : Object.values(flatObjectMetadataMaps.byUniversalIdentifier).find(
          (m) => m?.id === targetObjectId,
        );

    if (!targetObject) return undefined;

    currentObjectName = targetObject.nameSingular;
  }

  return undefined;
}

/**
 * Get the label identifier field name for an object (e.g. "name" for most
 * objects, "name" for Lead which is FULL_NAME type, etc.).
 */
function getLabelIdentifierFieldName(
  objectNameSingular: string,
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
  metadataIndex?: MetadataIndex,
): string | undefined {
  const objectMeta = metadataIndex
    ? metadataIndex.objectByName.get(objectNameSingular)
    : Object.values(flatObjectMetadataMaps.byUniversalIdentifier).find(
        (m) => m?.nameSingular === objectNameSingular,
      );

  if (!objectMeta?.labelIdentifierFieldMetadataId) return undefined;

  if (metadataIndex) {
    const fields = metadataIndex.fieldsByObjectId.get(objectMeta.id) ?? [];

    return fields.find(
      (f) => f.id === objectMeta.labelIdentifierFieldMetadataId,
    )?.name;
  }

  const labelField = Object.values(
    flatFieldMetadataMaps.byUniversalIdentifier,
  ).find((f) => f?.id === objectMeta.labelIdentifierFieldMetadataId);

  return labelField?.name;
}

/**
 * Build the auto-expanded selectedFieldPaths for a relation config:
 * always include 'id' and the label identifier field (e.g. 'name').
 */
function buildExpandedSelectedPaths(
  rc: RelationConfig,
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
  metadataIndex?: MetadataIndex,
): string[] {
  const paths = [...rc.selectedFieldPaths];

  const labelField = getLabelIdentifierFieldName(
    rc.targetObjectNameSingular,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
    metadataIndex,
  );

  if (labelField && !paths.includes(labelField)) {
    paths.unshift(labelField);
  }

  return paths;
}

/**
 * Traverse a record to get a deeply nested value by dot-separated path.
 */
function getNestedValue(
  record: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split('.');
  let current: unknown = record;

  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object'
    ) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Extract a human-readable label from a related record object.
 * Tries 'name' (string or FULL_NAME composite), then common fallbacks.
 */
function extractRecordLabel(obj: Record<string, unknown>): string {
  // String name field (most common label identifier)
  if (typeof obj.name === 'string' && obj.name) return obj.name;

  // FULL_NAME composite: { firstName, lastName }
  if (typeof obj.name === 'object' && obj.name !== null) {
    const nameObj = obj.name as Record<string, unknown>;

    return [nameObj.firstName, nameObj.lastName].filter(Boolean).join(' ');
  }

  for (const key of ['title', 'label', 'displayName']) {
    if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string;
  }

  return typeof obj.id === 'string' ? obj.id : '';
}

/**
 * Format a ONE_TO_MANY child record for CSV export.
 * For FamilyMember-like records: "Name • Type • MM/DD/YY"
 * For generic records: label identifier
 */
function formatOneToManyItem(item: Record<string, unknown>): string {
  // FamilyMember format
  if ('memberType' in item || 'dateOfBirth' in item) {
    const parts: string[] = [];

    const name = extractRecordLabel(item);

    // Skip if name is just a UUID (no real data)
    if (name && !isUuidLike(name)) parts.push(name);

    if (typeof item.memberType === 'string' && item.memberType) {
      parts.push(
        item.memberType.charAt(0).toUpperCase() +
          item.memberType.slice(1).toLowerCase(),
      );
    }

    if (typeof item.dateOfBirth === 'string' && item.dateOfBirth) {
      const date = new Date(item.dateOfBirth);

      if (!isNaN(date.getTime())) {
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(date.getUTCDate()).padStart(2, '0');
        const yy = String(date.getUTCFullYear()).slice(-2);

        parts.push(`${mm}/${dd}/${yy}`);
      }
    }

    // Skip empty stub records (no name, no type, no DOB)
    if (parts.length === 0) return '';

    return parts.join(' \u2022 ');
  }

  const label = extractRecordLabel(item);

  return isUuidLike(label) ? '' : label;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Normalize composite field values before export.
 * Currently normalizes US state names to 2-letter codes.
 */
function normalizeCompositeValue(
  compositeKey: string,
  value: unknown,
): unknown {
  if (compositeKey === 'addressState' && typeof value === 'string') {
    return normalizeUsState(value);
  }

  return value;
}

/**
 * Generate a flat key for a relation field path (matches frontend convention).
 * e.g. ("lead", "assignedAgent.name") => "lead__assignedAgent__name"
 */
function getRelationFieldFlatKey(
  relationFieldName: string,
  fieldPath: string,
): string {
  return `${relationFieldName}__${fieldPath.split('.').join('__')}`;
}

/**
 * Sanitize a string value for CSV export (prevent formula injection).
 * Allows phone calling codes like "+1" through unchanged.
 */
function sanitizeForCSV(value: string): string {
  if (/^[=@\t\r]/.test(value)) {
    return `'${value}`;
  }

  return value;
}

@Processor({ queueName: MessageQueue.exportQueue, scope: Scope.REQUEST })
export class ExportJobProcessor {
  private readonly logger = new Logger(ExportJobProcessor.name);

  constructor(
    private readonly exportJobService: ExportJobService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly fileStorageService: FileStorageService,
    private readonly fileUrlService: FileUrlService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  @Process(EXPORT_JOB_PROCESSOR_NAME)
  async handle(data: ExportJobData): Promise<void> {
    const { exportJobId, workspaceId } = data;

    this.logger.log(`Starting export job ${exportJobId}`);

    const exportJob = await this.exportJobService.getExportJob(
      exportJobId,
      workspaceId,
    );

    if (!exportJob) {
      this.logger.error(`Export job ${exportJobId} not found`);

      return;
    }

    if (exportJob.status === ExportJobStatus.CANCELLED) {
      this.logger.log(`Export job ${exportJobId} was cancelled before start`);

      return;
    }

    await this.exportJobService.updateProgress(exportJobId, {
      status: ExportJobStatus.PROCESSING,
    });

    const columns = exportJob.columns as ExportColumn[];
    const relationConfigs = (exportJob.relationConfigs ??
      []) as RelationConfig[];

    try {
      const authContext = buildSystemAuthContext(workspaceId);
      let allRecords: Record<string, unknown>[] = [];

      // Get workspace metadata for filter parsing and label resolution
      const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
        await this.workspaceCacheService.getOrRecompute(workspaceId, [
          'flatObjectMetadataMaps',
          'flatFieldMetadataMaps',
        ]);

      // Build pre-indexed metadata maps for O(1) lookups
      const metadataIndex = buildMetadataIndex(
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
      );

      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const repository = await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            exportJob.objectNameSingular,
            { shouldBypassPermissionChecks: true },
          );

          const flatObjectMetadata = Object.values(
            flatObjectMetadataMaps.byUniversalIdentifier,
          ).find((m) => m?.nameSingular === exportJob.objectNameSingular);

          // Build a base query builder with filter applied
          const buildFilteredQb = () => {
            const qb = repository.createQueryBuilder(
              exportJob.objectNameSingular,
            );

            if (exportJob.filter && flatObjectMetadata) {
              const parser = new GraphqlQueryParser(
                flatObjectMetadata,
                flatObjectMetadataMaps,
                flatFieldMetadataMaps,
              );

              parser.applyFilterToBuilder(
                qb,
                exportJob.objectNameSingular,
                exportJob.filter as Record<string, unknown>,
              );
            }

            return qb;
          };

          // Count total records
          const totalRecords = await buildFilteredQb().getCount();

          await this.exportJobService.updateProgress(exportJobId, {
            totalRecords,
          });

          // Fetch records in batches
          let offset = 0;
          let batchCount = 0;

          while (offset < totalRecords) {
            // Check for cancellation every N batches instead of every batch
            if (batchCount % CANCELLATION_CHECK_INTERVAL === 0) {
              const currentJob = await this.exportJobService.getExportJob(
                exportJobId,
                workspaceId,
              );

              if (currentJob?.status === ExportJobStatus.CANCELLED) {
                this.logger.log(
                  `Export job ${exportJobId} cancelled at offset ${offset}`,
                );
                break;
              }
            }

            const qb = buildFilteredQb();

            qb.orderBy(`"${exportJob.objectNameSingular}"."createdAt"`, 'DESC');
            qb.skip(offset);
            qb.take(BATCH_SIZE);

            const batch = await qb.getMany();

            allRecords.push(...(batch as Record<string, unknown>[]));
            offset += BATCH_SIZE;
            batchCount++;

            await this.exportJobService.updateProgress(exportJobId, {
              processedRecords: Math.min(offset, totalRecords),
            });
          }

          // Resolve direct MANY_TO_ONE relation columns (e.g. carrier)
          // that aren't covered by sub-field relation configs. Replace the
          // raw FK with the related record's label identifier.
          // Relations are resolved in parallel (concurrency-limited).
          if (allRecords.length > 0) {
            await this.exportJobService.updateProgress(exportJobId, {
              result: { phase: 'Resolving relations' },
            });

            const relationConfigFieldNames = new Set(
              relationConfigs.map((rc) => rc.relationFieldName),
            );

            // Collect all resolvable relation columns (sync, no I/O)
            const relationCols: {
              col: ExportColumn;
              targetObj: FlatObjectMetadata;
              joinCol: string;
              relatedIds: string[];
            }[] = [];

            for (const col of columns) {
              if (relationConfigFieldNames.has(col.fieldName)) continue;

              const colFieldMeta = findFieldMetadata(
                exportJob.objectNameSingular,
                col.fieldName,
                flatObjectMetadataMaps,
                flatFieldMetadataMaps,
                metadataIndex,
              );

              if (
                !colFieldMeta ||
                colFieldMeta.type !== FieldMetadataType.RELATION
              ) {
                continue;
              }

              const colRelSettings = colFieldMeta.settings as
                | FieldMetadataSettingsMapping[FieldMetadataType.RELATION]
                | null;

              if (colRelSettings?.relationType === 'ONE_TO_MANY') {
                continue;
              }

              const targetObjId = colFieldMeta.relationTargetObjectMetadataId;
              const targetObj = targetObjId
                ? metadataIndex.objectById.get(targetObjId)
                : undefined;

              if (!targetObj) continue;

              const joinCol =
                colRelSettings?.joinColumnName ?? `${col.fieldName}Id`;

              const relatedIds = [
                ...new Set(
                  allRecords
                    .map((r) => r[joinCol])
                    .filter(
                      (id): id is string =>
                        typeof id === 'string' && id.length > 0,
                    ),
                ),
              ];

              if (relatedIds.length === 0) continue;

              relationCols.push({ col, targetObj, joinCol, relatedIds });
            }

            // Resolve all relation columns in parallel
            const resolveRelationCol = async ({
              col,
              targetObj,
              joinCol,
              relatedIds,
            }: (typeof relationCols)[number]) => {
              try {
                const repo = await this.globalWorkspaceOrmManager.getRepository(
                  workspaceId,
                  targetObj.nameSingular,
                  { shouldBypassPermissionChecks: true },
                );

                const lookup = new Map<string, string>();

                for (
                  let i = 0;
                  i < relatedIds.length;
                  i += RELATION_BATCH_SIZE
                ) {
                  const batchIds = relatedIds.slice(i, i + RELATION_BATCH_SIZE);
                  const related = await repo
                    .createQueryBuilder(targetObj.nameSingular)
                    .where(`"${targetObj.nameSingular}"."id" IN (:...ids)`, {
                      ids: batchIds,
                    })
                    .getMany();

                  for (const r of related as Record<string, unknown>[]) {
                    if (typeof r.id === 'string') {
                      lookup.set(r.id, extractRecordLabel(r));
                    }
                  }
                }

                for (const record of allRecords) {
                  const fkVal = record[joinCol];

                  if (typeof fkVal === 'string' && lookup.has(fkVal)) {
                    record[col.fieldName] = lookup.get(fkVal);
                  }
                }
              } catch (error) {
                this.logger.warn(
                  `Failed to resolve ${col.fieldName} relation: ${error}`,
                );
              }
            };

            for (
              let i = 0;
              i < relationCols.length;
              i += RELATION_FETCH_CONCURRENCY
            ) {
              await Promise.all(
                relationCols
                  .slice(i, i + RELATION_FETCH_CONCURRENCY)
                  .map(resolveRelationCol),
              );
            }
          }

          // Fetch relation data if configured
          if (relationConfigs.length > 0 && allRecords.length > 0) {
            this.logger.log(
              `Expanding ${relationConfigs.length} relation fields for ${allRecords.length} records`,
            );
            await this.exportJobService.updateProgress(exportJobId, {
              result: { phase: 'Expanding relation fields' },
            });
            allRecords = await this.expandRelationFields(
              allRecords,
              relationConfigs,
              workspaceId,
              flatObjectMetadataMaps,
              flatFieldMetadataMaps,
              metadataIndex,
            );
          }
        },
        authContext,
      );

      // Check if cancelled during fetch
      const finalCheck = await this.exportJobService.getExportJob(
        exportJobId,
        workspaceId,
      );

      if (finalCheck?.status === ExportJobStatus.CANCELLED) {
        this.logger.log(`Export job ${exportJobId} cancelled`);

        return;
      }

      if (allRecords.length === 0) {
        await this.exportJobService.updateProgress(exportJobId, {
          status: ExportJobStatus.COMPLETED,
          totalRecords: 0,
          processedRecords: 0,
          result: { error: 'No records to export' },
        });

        return;
      }

      // Build CSV columns and generate CSV
      await this.exportJobService.updateProgress(exportJobId, {
        result: { phase: 'Generating file' },
      });

      const csvColumns = this.buildCsvColumns(
        columns,
        relationConfigs,
        exportJob.objectNameSingular,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
        metadataIndex,
      );

      const csvContent = this.generateCSV(allRecords, csvColumns);

      // Store in file storage
      const { workspaceCustomFlatApplication } =
        await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
          { workspaceId },
        );

      const resourcePath = `exports/${exportJobId}.csv`;

      const savedFile = await this.fileStorageService.writeFile({
        sourceFile: Buffer.from(csvContent, 'utf-8'),
        fileFolder: FileFolder.Export,
        applicationUniversalIdentifier:
          workspaceCustomFlatApplication.universalIdentifier,
        workspaceId,
        resourcePath,
        settings: { isTemporaryFile: true, toDelete: false },
      });

      // Generate signed download URL
      const downloadUrl = await this.fileUrlService.signFileByIdUrl({
        fileId: savedFile.id,
        workspaceId,
        fileFolder: FileFolder.Export,
      });

      await this.exportJobService.updateProgress(exportJobId, {
        status: ExportJobStatus.COMPLETED,
        processedRecords: allRecords.length,
        result: {
          fileId: savedFile.id,
          downloadUrl,
          recordCount: allRecords.length,
        },
      });

      this.logger.log(
        `Export job ${exportJobId} completed: ${allRecords.length} records exported`,
      );
    } catch (error) {
      this.logger.error(
        `Export job ${exportJobId} failed unexpectedly: ${error}`,
      );

      await this.exportJobService.updateProgress(exportJobId, {
        status: ExportJobStatus.FAILED,
        result: {
          error: error instanceof Error ? error.message : 'Unexpected error',
        },
      });
    }
  }

  /**
   * Fetch related records and flatten their fields onto the main records.
   *
   * Uses createQueryBuilder().getMany() instead of find() to ensure
   * composite fields (phones, emails, address, etc.) are properly
   * formatted as nested objects by the workspace formatResult layer.
   */
  private async expandRelationFields(
    records: Record<string, unknown>[],
    relationConfigs: RelationConfig[],
    workspaceId: string,
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
    metadataIndex?: MetadataIndex,
  ): Promise<Record<string, unknown>[]> {
    // Build lookup maps per relation — fetch all relations in parallel
    const relationLookups = new Map<
      string,
      {
        joinColumnName: string;
        lookupMap: Map<string, Record<string, unknown>>;
      }
    >();

    const fetchRelationLookup = async (rc: RelationConfig) => {
      const joinColumnName = `${rc.relationFieldName}Id`;

      // Collect unique related IDs
      const relatedIds = [
        ...new Set(
          records
            .map((r) => r[joinColumnName])
            .filter(
              (id): id is string => typeof id === 'string' && id.length > 0,
            ),
        ),
      ];

      if (relatedIds.length === 0) {
        return {
          fieldName: rc.relationFieldName,
          joinColumnName,
          lookupMap: new Map<string, Record<string, unknown>>(),
        };
      }

      const lookupMap = new Map<string, Record<string, unknown>>();

      try {
        const relatedRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            rc.targetObjectNameSingular,
            { shouldBypassPermissionChecks: true },
          );

        // Fetch in batches using createQueryBuilder + getMany
        // (getMany calls formatResult which converts flat DB columns
        //  into nested composite objects like phones, emails, etc.)
        for (let i = 0; i < relatedIds.length; i += RELATION_BATCH_SIZE) {
          const batchIds = relatedIds.slice(i, i + RELATION_BATCH_SIZE);

          const relatedRecords = await relatedRepository
            .createQueryBuilder(rc.targetObjectNameSingular)
            .where(`"${rc.targetObjectNameSingular}"."id" IN (:...ids)`, {
              ids: batchIds,
            })
            .getMany();

          for (const related of relatedRecords as Record<string, unknown>[]) {
            if (typeof related.id === 'string') {
              lookupMap.set(related.id, related);
            }
          }
        }

        this.logger.log(
          `Fetched ${lookupMap.size} ${rc.targetObjectNameSingular} records, resolving nested relations`,
        );

        // Resolve nested relations within the fetched records.
        await this.resolveNestedRelations(
          lookupMap,
          rc,
          workspaceId,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
          metadataIndex,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch related ${rc.targetObjectNameSingular} records: ${error}`,
        );
      }

      return { fieldName: rc.relationFieldName, joinColumnName, lookupMap };
    };

    // Run relation fetches with controlled concurrency
    for (
      let i = 0;
      i < relationConfigs.length;
      i += RELATION_FETCH_CONCURRENCY
    ) {
      const chunk = relationConfigs.slice(i, i + RELATION_FETCH_CONCURRENCY);
      const results = await Promise.all(chunk.map(fetchRelationLookup));

      for (const result of results) {
        relationLookups.set(result.fieldName, {
          joinColumnName: result.joinColumnName,
          lookupMap: result.lookupMap,
        });
      }
    }

    // Flatten relation fields onto each record
    return records.map((record) => {
      const expanded = { ...record };

      for (const rc of relationConfigs) {
        const lookup = relationLookups.get(rc.relationFieldName);

        if (!lookup) continue;

        const relatedId = record[lookup.joinColumnName];
        const relatedRecord =
          typeof relatedId === 'string'
            ? lookup.lookupMap.get(relatedId)
            : undefined;

        const selectedPaths = buildExpandedSelectedPaths(
          rc,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
          metadataIndex,
        );

        for (const fieldPath of selectedPaths) {
          const rawValue = relatedRecord
            ? getNestedValue(relatedRecord, fieldPath)
            : undefined;

          // Resolve field type to determine if this is a composite field
          const fieldMeta = resolveFieldPathMetadata(
            rc.targetObjectNameSingular,
            fieldPath,
            flatObjectMetadataMaps,
            flatFieldMetadataMaps,
            metadataIndex,
          );

          if (
            rawValue !== null &&
            rawValue !== undefined &&
            typeof rawValue === 'object' &&
            !Array.isArray(rawValue) &&
            fieldMeta &&
            isCompositeFieldType(fieldMeta.fieldType)
          ) {
            // Composite field — flatten sub-keys using known sub-field names
            const obj = rawValue as Record<string, unknown>;
            const subFieldLabels =
              COMPOSITE_FIELD_SUB_FIELD_LABELS[fieldMeta.fieldType];

            if (subFieldLabels) {
              for (const compositeKey of Object.keys(subFieldLabels)) {
                const flatKey = `${getRelationFieldFlatKey(rc.relationFieldName, fieldPath)}__${compositeKey}`;

                expanded[flatKey] =
                  normalizeCompositeValue(compositeKey, obj[compositeKey]) ??
                  '';
              }
            }
          } else if (
            rawValue !== null &&
            rawValue !== undefined &&
            typeof rawValue === 'object' &&
            !Array.isArray(rawValue) &&
            fieldMeta?.fieldType === FieldMetadataType.RELATION
          ) {
            // MANY_TO_ONE nested relation — extract label identifier
            const flatKey = getRelationFieldFlatKey(
              rc.relationFieldName,
              fieldPath,
            );
            const obj = rawValue as Record<string, unknown>;

            expanded[flatKey] = extractRecordLabel(obj);
          } else if (Array.isArray(rawValue)) {
            // ONE_TO_MANY nested relation — format as pipe-separated list
            const flatKey = getRelationFieldFlatKey(
              rc.relationFieldName,
              fieldPath,
            );

            expanded[flatKey] = (rawValue as Record<string, unknown>[])
              .map((item) => formatOneToManyItem(item))
              .filter(Boolean)
              .join(' | ');
          } else {
            const flatKey = getRelationFieldFlatKey(
              rc.relationFieldName,
              fieldPath,
            );

            expanded[flatKey] = rawValue ?? '';
          }
        }
      }

      return expanded;
    });
  }

  /**
   * For a relation config, identify selectedFieldPaths that traverse nested
   * MANY_TO_ONE relations (e.g. "leadSource.name") and recursively fetch
   * and attach those nested records.
   */
  private async resolveNestedRelations(
    lookupMap: Map<string, Record<string, unknown>>,
    rc: RelationConfig,
    workspaceId: string,
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
    metadataIndex?: MetadataIndex,
  ): Promise<void> {
    // Group selectedFieldPaths by their first segment when it's a relation.
    // Handles both dotted paths ("leadSource.name") and bare relation names
    // ("leadSource", "familyMembers") which need to be resolved and attached.
    const nestedRelationGroups = new Map<
      string,
      { targetObjectName: string; subPaths: string[]; isBareRelation: boolean }
    >();

    for (const fieldPath of rc.selectedFieldPaths) {
      const dotIndex = fieldPath.indexOf('.');

      let firstSegment: string;
      let restOfPath: string | undefined;

      if (dotIndex === -1) {
        // Bare field name — check if it's a relation that needs resolving
        firstSegment = fieldPath;
        restOfPath = undefined;
      } else {
        firstSegment = fieldPath.substring(0, dotIndex);
        restOfPath = fieldPath.substring(dotIndex + 1);
      }

      // Check if firstSegment is a RELATION field on the target object
      const fieldMeta = findFieldMetadata(
        rc.targetObjectNameSingular,
        firstSegment,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
        metadataIndex,
      );

      if (!fieldMeta || fieldMeta.type !== FieldMetadataType.RELATION) {
        continue;
      }

      const targetObjectId = fieldMeta.relationTargetObjectMetadataId;

      if (!targetObjectId) continue;

      const targetObject = metadataIndex
        ? metadataIndex.objectById.get(targetObjectId)
        : Object.values(flatObjectMetadataMaps.byUniversalIdentifier).find(
            (m) => m?.id === targetObjectId,
          );

      if (!targetObject) continue;

      const existing = nestedRelationGroups.get(firstSegment);

      if (existing) {
        if (restOfPath) {
          existing.subPaths.push(restOfPath);
        }
      } else {
        nestedRelationGroups.set(firstSegment, {
          targetObjectName: targetObject.nameSingular,
          subPaths: restOfPath ? [restOfPath] : [],
          isBareRelation: dotIndex === -1,
        });
      }
    }

    if (nestedRelationGroups.size === 0) return;

    const resolveNestedGroup = async (
      relationFieldName: string,
      {
        targetObjectName,
        subPaths,
      }: {
        targetObjectName: string;
        subPaths: string[];
        isBareRelation: boolean;
      },
    ) => {
      // Determine if this is a MANY_TO_ONE or ONE_TO_MANY relation
      const fieldMeta = findFieldMetadata(
        rc.targetObjectNameSingular,
        relationFieldName,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
        metadataIndex,
      );

      const fieldRelSettings = fieldMeta?.settings as
        | FieldMetadataSettingsMapping[FieldMetadataType.RELATION]
        | null
        | undefined;

      const relationType = fieldRelSettings?.relationType ?? 'MANY_TO_ONE';

      const isOneToMany = relationType === 'ONE_TO_MANY';

      try {
        const nestedRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            targetObjectName,
            { shouldBypassPermissionChecks: true },
          );

        if (isOneToMany) {
          // ONE_TO_MANY (e.g., familyMembers): fetch child records by
          // parent FK and attach as array.
          const parentObjectMeta = metadataIndex
            ? metadataIndex.objectByName.get(rc.targetObjectNameSingular)
            : Object.values(flatObjectMetadataMaps.byUniversalIdentifier).find(
                (m) => m?.nameSingular === rc.targetObjectNameSingular,
              );

          const targetObjMeta = metadataIndex
            ? metadataIndex.objectByName.get(targetObjectName)
            : Object.values(flatObjectMetadataMaps.byUniversalIdentifier).find(
                (m) => m?.nameSingular === targetObjectName,
              );

          const childFkField =
            parentObjectMeta && targetObjMeta
              ? (metadataIndex
                  ? (metadataIndex.fieldsByObjectId.get(targetObjMeta.id) ?? [])
                  : Object.values(flatFieldMetadataMaps.byUniversalIdentifier)
                ).find(
                  (f) =>
                    f?.objectMetadataId === targetObjMeta.id &&
                    f?.type === FieldMetadataType.RELATION &&
                    f?.relationTargetObjectMetadataId === parentObjectMeta.id,
                )
              : undefined;

          const childFkRelSettings = childFkField?.settings as
            | FieldMetadataSettingsMapping[FieldMetadataType.RELATION]
            | null
            | undefined;

          const parentFk =
            childFkRelSettings?.joinColumnName ??
            `${rc.targetObjectNameSingular}Id`;

          const parentIds = [...lookupMap.keys()];

          if (parentIds.length === 0) return;

          const childRecordsByParent = new Map<
            string,
            Record<string, unknown>[]
          >();

          for (let i = 0; i < parentIds.length; i += RELATION_BATCH_SIZE) {
            const batchIds = parentIds.slice(i, i + RELATION_BATCH_SIZE);

            const childRecords = await nestedRepository
              .createQueryBuilder(targetObjectName)
              .where(`"${targetObjectName}"."${parentFk}" IN (:...ids)`, {
                ids: batchIds,
              })
              .getMany();

            for (const child of childRecords as Record<string, unknown>[]) {
              const pid = child[parentFk] as string;

              if (!pid) continue;

              const existing = childRecordsByParent.get(pid) ?? [];

              existing.push(child);
              childRecordsByParent.set(pid, existing);
            }
          }

          // Attach child arrays to parent records
          for (const [parentId, parentRecord] of lookupMap) {
            parentRecord[relationFieldName] =
              childRecordsByParent.get(parentId) ?? [];
          }
        } else {
          // MANY_TO_ONE (e.g., leadSource): fetch by FK IDs
          const joinColumnName = `${relationFieldName}Id`;

          const nestedIds = [
            ...new Set(
              [...lookupMap.values()]
                .map((r) => r[joinColumnName])
                .filter(
                  (id): id is string => typeof id === 'string' && id.length > 0,
                ),
            ),
          ];

          if (nestedIds.length === 0) return;

          const nestedLookup = new Map<string, Record<string, unknown>>();

          for (let i = 0; i < nestedIds.length; i += RELATION_BATCH_SIZE) {
            const batchIds = nestedIds.slice(i, i + RELATION_BATCH_SIZE);

            const nestedRecords = await nestedRepository
              .createQueryBuilder(targetObjectName)
              .where(`"${targetObjectName}"."id" IN (:...ids)`, {
                ids: batchIds,
              })
              .getMany();

            for (const nested of nestedRecords as Record<string, unknown>[]) {
              if (typeof nested.id === 'string') {
                nestedLookup.set(nested.id, nested);
              }
            }
          }

          // Recursively resolve deeper nested relations if there are
          // dotted sub-paths
          if (subPaths.length > 0) {
            const nestedRelationConfig: RelationConfig = {
              relationFieldName,
              relationFieldLabel: '',
              targetObjectNameSingular: targetObjectName,
              selectedFieldPaths: subPaths,
            };

            await this.resolveNestedRelations(
              nestedLookup,
              nestedRelationConfig,
              workspaceId,
              flatObjectMetadataMaps,
              flatFieldMetadataMaps,
              metadataIndex,
            );
          }

          // Attach nested records to parent records
          for (const parentRecord of lookupMap.values()) {
            const nestedId = parentRecord[joinColumnName];

            if (typeof nestedId === 'string') {
              const nestedRecord = nestedLookup.get(nestedId);

              if (nestedRecord) {
                parentRecord[relationFieldName] = nestedRecord;
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch nested ${targetObjectName} records: ${error}`,
        );
      }
    };

    // Resolve all nested relation groups in parallel
    const groupEntries = [...nestedRelationGroups.entries()];

    for (let i = 0; i < groupEntries.length; i += RELATION_FETCH_CONCURRENCY) {
      const chunk = groupEntries.slice(i, i + RELATION_FETCH_CONCURRENCY);

      await Promise.all(
        chunk.map(([fieldName, group]) => resolveNestedGroup(fieldName, group)),
      );
    }
  }

  /**
   * Build CSV column definitions with proper human-readable labels.
   *
   * For main record fields, uses metadata labels and expands composite
   * fields into sub-columns (e.g. Premium → Premium / Amount, Premium / Currency).
   *
   * For relation fields, uses metadata labels for each path segment
   * and expands composite sub-fields at the leaf level.
   */
  private buildCsvColumns(
    columns: ExportColumn[],
    relationConfigs: RelationConfig[],
    objectNameSingular: string,
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
    metadataIndex?: MetadataIndex,
  ): CsvColumn[] {
    const relationFieldNames = new Set(
      relationConfigs.map((rc) => rc.relationFieldName),
    );

    const csvColumns: CsvColumn[] = [];

    // Always include Id as first column
    csvColumns.push({ field: 'id', title: 'Id' });

    for (const col of columns) {
      if (col.fieldName === 'id') continue;

      // Check if this column is a relation with expanded sub-fields
      if (relationFieldNames.has(col.fieldName)) {
        const rc = relationConfigs.find(
          (r) => r.relationFieldName === col.fieldName,
        );

        if (!rc) {
          csvColumns.push({ field: col.fieldName, title: col.label });
          continue;
        }

        const selectedPaths = buildExpandedSelectedPaths(
          rc,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
          metadataIndex,
        );

        for (const fieldPath of selectedPaths) {
          const resolved = resolveFieldPathMetadata(
            rc.targetObjectNameSingular,
            fieldPath,
            flatObjectMetadataMaps,
            flatFieldMetadataMaps,
            metadataIndex,
          );

          if (resolved && isCompositeFieldType(resolved.fieldType)) {
            const subFieldLabels =
              COMPOSITE_FIELD_SUB_FIELD_LABELS[resolved.fieldType];

            if (subFieldLabels) {
              for (const [compositeKey, compositeLabel] of Object.entries(
                subFieldLabels,
              )) {
                csvColumns.push({
                  field: `${getRelationFieldFlatKey(rc.relationFieldName, fieldPath)}__${compositeKey}`,
                  title: `${rc.relationFieldLabel} / ${resolved.label} / ${compositeLabel}`,
                });
              }
            }
          } else {
            const label = resolved
              ? `${rc.relationFieldLabel} / ${resolved.label}`
              : `${rc.relationFieldLabel} / ${fieldPath}`;

            csvColumns.push({
              field: getRelationFieldFlatKey(rc.relationFieldName, fieldPath),
              title: label,
            });
          }
        }

        continue;
      }

      // Main record field — check if composite and expand
      const fieldMeta = findFieldMetadata(
        objectNameSingular,
        col.fieldName,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
        metadataIndex,
      );

      const fieldType = fieldMeta
        ? (fieldMeta.type as FieldMetadataType)
        : (col.type as FieldMetadataType);

      const fieldLabel = fieldMeta ? fieldMeta.label : col.label;

      if (isCompositeFieldType(fieldType)) {
        const subFieldLabels = COMPOSITE_FIELD_SUB_FIELD_LABELS[fieldType];

        if (subFieldLabels) {
          for (const [compositeKey, compositeLabel] of Object.entries(
            subFieldLabels,
          )) {
            csvColumns.push({
              field: `${col.fieldName}.${compositeKey}`,
              title: `${fieldLabel} / ${compositeLabel}`,
            });
          }
        }
      } else {
        csvColumns.push({
          field: col.fieldName,
          title: fieldLabel,
        });
      }
    }

    return csvColumns;
  }

  /**
   * Generate the final CSV string from records and column definitions.
   *
   * Handles:
   * - Composite field flattening (CURRENCY amount conversion, nested objects)
   * - CSV sanitization (formula injection prevention)
   * - Empty field normalization
   */
  private generateCSV(
    records: Record<string, unknown>[],
    csvColumns: CsvColumn[],
  ): string {
    if (records.length === 0) return '';

    // Process records: flatten composite fields and sanitize values
    const processedRecords = records.map((record) => {
      const processed: Record<string, unknown> = {};

      for (const col of csvColumns) {
        const dotIndex = col.field.indexOf('.');

        if (dotIndex !== -1) {
          // Composite field sub-key (e.g. "premium.amountMicros")
          const parentField = col.field.substring(0, dotIndex);
          const subKey = col.field.substring(dotIndex + 1);
          const parentValue = record[parentField];

          if (
            parentValue !== null &&
            parentValue !== undefined &&
            typeof parentValue === 'object'
          ) {
            let subValue = normalizeCompositeValue(
              subKey,
              (parentValue as Record<string, unknown>)[subKey],
            );

            // Convert amountMicros to human-readable amount
            if (subKey === 'amountMicros' && typeof subValue === 'number') {
              subValue = subValue / 1_000_000;
            }

            processed[col.field] =
              typeof subValue === 'string'
                ? sanitizeForCSV(subValue)
                : (subValue ?? '');
          } else {
            processed[col.field] = '';
          }
        } else {
          // Simple field or relation flat key
          const value = record[col.field];

          if (value === null || value === undefined) {
            processed[col.field] = '';
          } else if (value instanceof Date) {
            processed[col.field] = value.toISOString();
          } else if (typeof value === 'string') {
            processed[col.field] = sanitizeForCSV(value);
          } else if (typeof value === 'object') {
            // Unexpected object — stringify as fallback
            processed[col.field] = JSON.stringify(value);
          } else {
            processed[col.field] = value;
          }
        }
      }

      return processed;
    });

    const keys = csvColumns.map((col) => ({
      field: col.field,
      title: sanitizeForCSV(col.title),
    }));

    return json2csv(processedRecords, { keys, emptyFieldValue: '' });
  }
}
