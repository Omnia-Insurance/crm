import { InjectDataSource } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { DataSource } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import {
  buildOneToManyRelationFilterLookup,
  type OneToManyRelationFilterLookup,
} from 'src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/utils/build-one-to-many-relation-filter-lookup.util';
import {
  getOneToManyRecordFilterFix,
  type OneToManyRecordFilterFix,
  type OneToManyRecordFilterManualFixReason,
  type StoredRecordFilterShape,
} from 'src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/utils/get-one-to-many-record-filter-fix.util';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { withDerivedFieldMetadataMaps } from 'src/engine/metadata-modules/flat-entity/utils/with-derived-field-metadata-maps.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

type ViewFilterRow = StoredRecordFilterShape & { id: string };

type JsonStoredRecordFilterRow = StoredRecordFilterShape & { ownerId: string };

type ViewFilterRelationTarget = {
  id: string;
  subFieldName: string | null;
  relationTargetFieldMetadataId: string;
};

const FIX_DESCRIPTIONS = {
  setRelationTarget: 'store the target field name instead of a relation target',
  clearSubFieldName: 'carry a sub-field name on a has any / has no filter',
  delete: 'filter a one-to-many relation by record, which never validates',
  targetFieldNotFound: 'name a target field that is missing or inactive',
  targetFieldNotTraversable:
    'name a one-to-many or morph relation the server does not traverse',
  operandNotSupported:
    'use an operand the relation or its target field rejects',
} as const satisfies Record<
  | Exclude<OneToManyRecordFilterFix['kind'], 'manualFix'>
  | OneToManyRecordFilterManualFixReason,
  string
>;

const describeFix = (fix: OneToManyRecordFilterFix) =>
  fix.kind === 'manualFix'
    ? FIX_DESCRIPTIONS[fix.reason]
    : FIX_DESCRIPTIONS[fix.kind];

// jsonb_array_elements raises on anything but an array, and may run before the WHERE clause
const asJsonbArray = (expression: string) =>
  `CASE WHEN jsonb_typeof(${expression}) = 'array' THEN ${expression} ELSE '[]'::jsonb END`;

// Only the keys that classify a filter are read, so filter values never leave the database
const RECORD_FILTER_SHAPE_COLUMNS = `"recordFilter" ->> 'fieldMetadataId' AS "fieldMetadataId",
         "recordFilter" ->> 'relationTargetFieldMetadataId' AS "relationTargetFieldMetadataId",
         "recordFilter" ->> 'subFieldName' AS "subFieldName",
         "recordFilter" ->> 'operand' AS operand`;

// v2.58 filters a one-to-many relation through relationTargetFieldMetadataId; Omnia saved the
// target field name in subFieldName, which the server rejects
@RegisteredWorkspaceCommand('2.58.0', 1794500004000)
@Command({
  name: 'upgrade:2-58:omnia-migrate-one-to-many-view-filters',
  description:
    'Point one-to-many relation view filters at their target field, drop the sub-field name of their has any / has no filters, delete those that can never validate, and report chart and workflow filters left in the old shape',
})
export class OmniaMigrateOneToManyViewFiltersCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = options.dryRun ?? false;
    const logPrefix = `${isDryRun ? '[DRY RUN] ' : ''}Workspace ${workspaceId}:`;

    const { flatFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatFieldMetadataMaps',
      ]);

    const lookup = buildOneToManyRelationFilterLookup(
      Object.values(flatFieldMetadataMaps.byUniversalIdentifier).filter(
        isDefined,
      ),
    );

    const oneToManyRelationFieldMetadataIds = [
      ...lookup.targetObjectMetadataIdByRelationFieldMetadataId.keys(),
    ];

    if (!isNonEmptyArray(oneToManyRelationFieldMetadataIds)) {
      return;
    }

    await this.migrateViewFilters({
      workspaceId,
      isDryRun,
      logPrefix,
      lookup,
      oneToManyRelationFieldMetadataIds,
    });

    await this.reportJsonStoredRecordFilters({
      workspaceId,
      logPrefix,
      lookup,
      oneToManyRelationFieldMetadataIds,
    });
  }

  private async migrateViewFilters({
    workspaceId,
    isDryRun,
    logPrefix,
    lookup,
    oneToManyRelationFieldMetadataIds,
  }: {
    workspaceId: string;
    isDryRun: boolean;
    logPrefix: string;
    lookup: OneToManyRelationFilterLookup;
    oneToManyRelationFieldMetadataIds: string[];
  }): Promise<void> {
    const viewFilters = await this.coreDataSource.query<ViewFilterRow[]>(
      `SELECT id, "fieldMetadataId", "relationTargetFieldMetadataId", "subFieldName", operand
       FROM core."viewFilter"
       WHERE "workspaceId" = $1
         AND "deletedAt" IS NULL
         AND "relationTargetFieldMetadataId" IS NULL
         AND "fieldMetadataId" = ANY($2::uuid[])
       ORDER BY id`,
      [workspaceId, oneToManyRelationFieldMetadataIds],
    );

    const relationTargets: ViewFilterRelationTarget[] = [];
    const viewFilterIdsToClearSubFieldName: string[] = [];
    const viewFilterIdsToDelete: string[] = [];
    const viewFilterIdsByManualFixDescription = new Map<string, string[]>();

    for (const viewFilter of viewFilters) {
      const fix = getOneToManyRecordFilterFix({
        recordFilter: viewFilter,
        lookup,
      });

      switch (fix?.kind) {
        case 'setRelationTarget':
          relationTargets.push({
            id: viewFilter.id,
            subFieldName: viewFilter.subFieldName,
            relationTargetFieldMetadataId: fix.relationTargetFieldMetadataId,
          });
          break;
        case 'clearSubFieldName':
          viewFilterIdsToClearSubFieldName.push(viewFilter.id);
          break;
        case 'delete':
          viewFilterIdsToDelete.push(viewFilter.id);
          break;
        case 'manualFix': {
          const description = describeFix(fix);

          viewFilterIdsByManualFixDescription.set(description, [
            ...(viewFilterIdsByManualFixDescription.get(description) ?? []),
            viewFilter.id,
          ]);
          break;
        }
      }
    }

    for (const [
      description,
      viewFilterIds,
    ] of viewFilterIdsByManualFixDescription) {
      this.logger.warn(
        `${logPrefix} left ${viewFilterIds.length} one-to-many view filter(s) unchanged that ${description}, fix them by hand: ${viewFilterIds.join(', ')}`,
      );
    }

    const plannedChanges = [
      {
        description: 'view filter(s) pointed at their relation target',
        viewFilterIds: relationTargets.map(({ id }) => id),
      },
      {
        description: 'has any / has no view filter(s) without a sub-field name',
        viewFilterIds: viewFilterIdsToClearSubFieldName,
      },
      {
        description: 'view filter(s) deleted that can never validate',
        viewFilterIds: viewFilterIdsToDelete,
      },
    ]
      .filter(({ viewFilterIds }) => isNonEmptyArray(viewFilterIds))
      .map(
        ({ description, viewFilterIds }) =>
          `${viewFilterIds.length} ${description} (${viewFilterIds.join(', ')})`,
      );

    if (!isNonEmptyArray(plannedChanges)) {
      return;
    }

    if (isDryRun) {
      this.logger.log(
        `${logPrefix} would migrate one-to-many view filters: ${plannedChanges.join('; ')}`,
      );

      return;
    }

    const relationTargetCount = await this.setViewFilterRelationTargets({
      workspaceId,
      relationTargets,
    });
    const clearedSubFieldNameCount = await this.clearViewFilterSubFieldNames({
      workspaceId,
      viewFilterIds: viewFilterIdsToClearSubFieldName,
    });
    const deletedCount = await this.deleteViewFilters({
      workspaceId,
      viewFilterIds: viewFilterIdsToDelete,
    });
    const writtenCount =
      relationTargetCount + clearedSubFieldNameCount + deletedCount;

    this.logger.log(
      `${logPrefix} migrated one-to-many view filters, ${writtenCount} row(s) written: ${plannedChanges.join('; ')}`,
    );

    if (writtenCount === 0) {
      return;
    }

    // Views, view filter groups and fields aggregate their view filter ids, so a delete stales them too
    await this.workspaceCacheService.invalidateAndRecompute(
      workspaceId,
      deletedCount > 0
        ? withDerivedFieldMetadataMaps([
            'flatViewFilterMaps',
            'flatViewMaps',
            'flatViewFilterGroupMaps',
            'flatFieldMetadataMaps',
          ])
        : ['flatViewFilterMaps'],
    );
  }

  private async setViewFilterRelationTargets({
    workspaceId,
    relationTargets,
  }: {
    workspaceId: string;
    relationTargets: ViewFilterRelationTarget[];
  }): Promise<number> {
    if (!isNonEmptyArray(relationTargets)) {
      return 0;
    }

    // Compare-and-set on the sub-field name, so a filter edited since it was read is left as is
    const [, updatedCount]: [unknown, number] = await this.coreDataSource.query(
      `UPDATE core."viewFilter" AS "viewFilter"
       SET "relationTargetFieldMetadataId" = "relationTarget"."relationTargetFieldMetadataId",
           "subFieldName" = NULL,
           "updatedAt" = now()
       FROM jsonb_to_recordset($2::jsonb) AS "relationTarget"(id uuid, "subFieldName" text, "relationTargetFieldMetadataId" uuid)
       JOIN core."fieldMetadata" "targetFieldMetadata"
         ON "targetFieldMetadata".id = "relationTarget"."relationTargetFieldMetadataId"
        AND "targetFieldMetadata"."workspaceId" = $1
       WHERE "viewFilter"."workspaceId" = $1
         AND "viewFilter".id = "relationTarget".id
         AND "viewFilter"."deletedAt" IS NULL
         AND "viewFilter"."relationTargetFieldMetadataId" IS NULL
         AND "viewFilter"."subFieldName" = "relationTarget"."subFieldName"
         AND "viewFilter".operand NOT IN ('IS_EMPTY', 'IS_NOT_EMPTY')`,
      [workspaceId, JSON.stringify(relationTargets)],
    );

    return updatedCount;
  }

  private async clearViewFilterSubFieldNames({
    workspaceId,
    viewFilterIds,
  }: {
    workspaceId: string;
    viewFilterIds: string[];
  }): Promise<number> {
    if (!isNonEmptyArray(viewFilterIds)) {
      return 0;
    }

    const [, updatedCount]: [unknown, number] = await this.coreDataSource.query(
      `UPDATE core."viewFilter"
       SET "subFieldName" = NULL,
           "updatedAt" = now()
       WHERE "workspaceId" = $1
         AND id = ANY($2::uuid[])
         AND "deletedAt" IS NULL
         AND "relationTargetFieldMetadataId" IS NULL
         AND "subFieldName" IS NOT NULL
         AND operand IN ('IS_EMPTY', 'IS_NOT_EMPTY')`,
      [workspaceId, viewFilterIds],
    );

    return updatedCount;
  }

  // Hard delete: the view filter cache also loads soft-deleted rows, and v2.58 deletes view filters for good
  private async deleteViewFilters({
    workspaceId,
    viewFilterIds,
  }: {
    workspaceId: string;
    viewFilterIds: string[];
  }): Promise<number> {
    if (!isNonEmptyArray(viewFilterIds)) {
      return 0;
    }

    const [, deletedCount]: [unknown, number] = await this.coreDataSource.query(
      `DELETE FROM core."viewFilter"
       WHERE "workspaceId" = $1
         AND id = ANY($2::uuid[])
         AND "deletedAt" IS NULL
         AND "relationTargetFieldMetadataId" IS NULL
         AND COALESCE("subFieldName", '') = ''
         AND operand IN ('IS', 'IS_NOT')`,
      [workspaceId, viewFilterIds],
    );

    return deletedCount;
  }

  private async reportJsonStoredRecordFilters({
    workspaceId,
    logPrefix,
    lookup,
    oneToManyRelationFieldMetadataIds,
  }: {
    workspaceId: string;
    logPrefix: string;
    lookup: OneToManyRelationFilterLookup;
    oneToManyRelationFieldMetadataIds: string[];
  }): Promise<void> {
    const widgetRecordFilters = await this.coreDataSource.query<
      JsonStoredRecordFilterRow[]
    >(
      `SELECT "pageLayoutWidget".id AS "ownerId",
         ${RECORD_FILTER_SHAPE_COLUMNS}
       FROM core."pageLayoutWidget" "pageLayoutWidget"
       CROSS JOIN LATERAL jsonb_array_elements(${asJsonbArray(`"pageLayoutWidget".configuration -> 'filter' -> 'recordFilters'`)}) AS "recordFilter"
       WHERE "pageLayoutWidget"."workspaceId" = $1
         AND "pageLayoutWidget"."deletedAt" IS NULL
         AND "recordFilter" ->> 'fieldMetadataId' = ANY($2::text[])`,
      [workspaceId, oneToManyRelationFieldMetadataIds],
    );

    this.reportRecordFilters({
      logPrefix,
      lookup,
      ownerLabel: 'page layout widget',
      recordFilters: widgetRecordFilters,
    });

    const workflowVersionRecordFilters =
      await this.findFindRecordsStepRecordFilters({
        tableName: 'core."workflowVersion"',
        whereClause: `"workflowVersion"."workspaceId" = $1
         AND "recordFilter" ->> 'fieldMetadataId' = ANY($2::text[])`,
        parameters: [workspaceId, oneToManyRelationFieldMetadataIds],
      });

    this.reportRecordFilters({
      logPrefix,
      lookup,
      ownerLabel: 'workflow version',
      recordFilters: workflowVersionRecordFilters,
    });

    const workspaceWorkflowVersionTableName = `${escapeIdentifier(getWorkspaceSchemaName(workspaceId))}."workflowVersion"`;

    if (!(await this.tableExists(workspaceWorkflowVersionTableName))) {
      return;
    }

    const workspaceWorkflowVersionRecordFilters =
      await this.findFindRecordsStepRecordFilters({
        tableName: workspaceWorkflowVersionTableName,
        whereClause: `"workflowVersion"."deletedAt" IS NULL
         AND "recordFilter" ->> 'fieldMetadataId' = ANY($1::text[])`,
        parameters: [oneToManyRelationFieldMetadataIds],
      });

    this.reportRecordFilters({
      logPrefix,
      lookup,
      ownerLabel: 'workspace workflow version',
      recordFilters: workspaceWorkflowVersionRecordFilters,
    });
  }

  private async findFindRecordsStepRecordFilters({
    tableName,
    whereClause,
    parameters,
  }: {
    tableName: string;
    whereClause: string;
    parameters: unknown[];
  }): Promise<JsonStoredRecordFilterRow[]> {
    return this.coreDataSource.query<JsonStoredRecordFilterRow[]>(
      `SELECT "workflowVersion".id AS "ownerId",
         ${RECORD_FILTER_SHAPE_COLUMNS}
       FROM ${tableName} "workflowVersion"
       CROSS JOIN LATERAL jsonb_array_elements(${asJsonbArray(`"workflowVersion".steps`)}) AS "step"
       CROSS JOIN LATERAL jsonb_array_elements(${asJsonbArray(`"step" -> 'settings' -> 'input' -> 'filter' -> 'recordFilters'`)}) AS "recordFilter"
       WHERE "step" ->> 'type' = 'FIND_RECORDS'
         AND ${whereClause}`,
      parameters,
    );
  }

  // Chart and workflow filters are only reported: they are fixed by hand in their own editors
  private reportRecordFilters({
    logPrefix,
    lookup,
    ownerLabel,
    recordFilters,
  }: {
    logPrefix: string;
    lookup: OneToManyRelationFilterLookup;
    ownerLabel: string;
    recordFilters: JsonStoredRecordFilterRow[];
  }): void {
    const ownerIdsByDescription = new Map<string, Set<string>>();
    const filterCountByDescription = new Map<string, number>();

    for (const recordFilter of recordFilters) {
      const fix = getOneToManyRecordFilterFix({ recordFilter, lookup });

      if (!isDefined(fix)) {
        continue;
      }

      const description = describeFix(fix);
      const ownerIds =
        ownerIdsByDescription.get(description) ?? new Set<string>();

      ownerIds.add(recordFilter.ownerId);
      ownerIdsByDescription.set(description, ownerIds);
      filterCountByDescription.set(
        description,
        (filterCountByDescription.get(description) ?? 0) + 1,
      );
    }

    for (const [description, ownerIds] of ownerIdsByDescription) {
      this.logger.warn(
        `${logPrefix} ${filterCountByDescription.get(description)} one-to-many filter(s) in ${ownerIds.size} ${ownerLabel}(s) ${description}, fix them by hand: ${[...ownerIds].join(', ')}`,
      );
    }
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const [{ exists }]: { exists: boolean }[] = await this.coreDataSource.query(
      `SELECT to_regclass($1) IS NOT NULL AS "exists"`,
      [tableName],
    );

    return exists;
  }
}
