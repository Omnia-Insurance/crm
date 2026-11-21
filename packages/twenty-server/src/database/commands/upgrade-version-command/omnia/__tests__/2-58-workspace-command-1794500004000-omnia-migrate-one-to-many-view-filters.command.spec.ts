import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaMigrateOneToManyViewFiltersCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500004000-omnia-migrate-one-to-many-view-filters.command';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { addFlatEntityToFlatEntityMapsThroughMutationOrThrow } from 'src/engine/workspace-manager/workspace-migration/utils/add-flat-entity-to-flat-entity-maps-through-mutation-or-throw.util';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const PERSON_OBJECT_ID = '20202020-0000-0000-0000-0000000000b1';
const POLICY_OBJECT_ID = '20202020-0000-0000-0000-0000000000b2';
const PAYMENT_OBJECT_ID = '20202020-0000-0000-0000-0000000000b3';

const POLICIES_FIELD_ID = '20202020-0000-0000-0000-0000000000c1';
const POLICY_STATUS_FIELD_ID = '20202020-0000-0000-0000-0000000000c2';
const POLICY_PAYMENTS_FIELD_ID = '20202020-0000-0000-0000-0000000000c3';
const POLICY_LEGACY_CODE_FIELD_ID = '20202020-0000-0000-0000-0000000000c4';

const TRAVERSAL_VIEW_FILTER_ID = '20202020-0000-0000-0000-0000000000d1';
const STRAY_SUB_FIELD_VIEW_FILTER_ID = '20202020-0000-0000-0000-0000000000d2';
const BY_RECORD_VIEW_FILTER_ID = '20202020-0000-0000-0000-0000000000d3';
const TO_MANY_TARGET_VIEW_FILTER_ID = '20202020-0000-0000-0000-0000000000d4';
const INACTIVE_TARGET_VIEW_FILTER_ID = '20202020-0000-0000-0000-0000000000d5';
const EMPTINESS_VIEW_FILTER_ID = '20202020-0000-0000-0000-0000000000d6';

const CHART_WIDGET_ID = '20202020-0000-0000-0000-0000000000e1';
const WORKFLOW_VERSION_ID = '20202020-0000-0000-0000-0000000000e2';
const WORKSPACE_WORKFLOW_VERSION_ID = '20202020-0000-0000-0000-0000000000e3';

const WORKSPACE_WORKFLOW_VERSION_TABLE_PREFIX = 'FROM "workspace_';

// Stands in for a filter value holding PHI; it must never reach a log line
const PHI_FILTER_VALUE = 'Jane Doe +1 555 0100';

const buildFieldMetadata = (
  overrides: Parameters<typeof getFlatFieldMetadataMock>[0],
): FlatFieldMetadata =>
  getFlatFieldMetadataMock({ workspaceId: WORKSPACE_ID, ...overrides });

const FLAT_FIELD_METADATAS = [
  buildFieldMetadata({
    id: POLICIES_FIELD_ID,
    universalIdentifier: POLICIES_FIELD_ID,
    objectMetadataId: PERSON_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name: 'policies',
    relationTargetObjectMetadataId: POLICY_OBJECT_ID,
    settings: { relationType: RelationType.ONE_TO_MANY },
  }),
  buildFieldMetadata({
    id: POLICY_STATUS_FIELD_ID,
    universalIdentifier: POLICY_STATUS_FIELD_ID,
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.SELECT,
    name: 'status',
  }),
  buildFieldMetadata({
    id: POLICY_PAYMENTS_FIELD_ID,
    universalIdentifier: POLICY_PAYMENTS_FIELD_ID,
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name: 'payments',
    relationTargetObjectMetadataId: PAYMENT_OBJECT_ID,
    settings: { relationType: RelationType.ONE_TO_MANY },
  }),
  buildFieldMetadata({
    id: POLICY_LEGACY_CODE_FIELD_ID,
    universalIdentifier: POLICY_LEGACY_CODE_FIELD_ID,
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.TEXT,
    name: 'legacyCode',
    isActive: false,
  }),
];

const buildFlatFieldMetadataMaps = () => {
  const flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata> =
    createEmptyFlatEntityMaps();

  for (const flatFieldMetadata of FLAT_FIELD_METADATAS) {
    addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
      flatEntity: flatFieldMetadata,
      flatEntityMapsToMutate: flatFieldMetadataMaps,
    });
  }

  return flatFieldMetadataMaps;
};

type StoredFilterRowFixture = {
  fieldMetadataId: string;
  relationTargetFieldMetadataId: string | null;
  subFieldName: string | null;
  operand: string;
  value: string;
};

const buildViewFilterRow = (
  id: string,
  { subFieldName, operand }: { subFieldName: string | null; operand: string },
): StoredFilterRowFixture & { id: string } => ({
  id,
  fieldMetadataId: POLICIES_FIELD_ID,
  relationTargetFieldMetadataId: null,
  subFieldName,
  operand,
  value: PHI_FILTER_VALUE,
});

const LEGACY_VIEW_FILTER_ROWS = [
  buildViewFilterRow(TRAVERSAL_VIEW_FILTER_ID, {
    subFieldName: 'status',
    operand: 'IS',
  }),
  buildViewFilterRow(STRAY_SUB_FIELD_VIEW_FILTER_ID, {
    subFieldName: 'status',
    operand: 'IS_EMPTY',
  }),
  buildViewFilterRow(BY_RECORD_VIEW_FILTER_ID, {
    subFieldName: null,
    operand: 'IS',
  }),
  buildViewFilterRow(TO_MANY_TARGET_VIEW_FILTER_ID, {
    subFieldName: 'payments',
    operand: 'IS',
  }),
  buildViewFilterRow(INACTIVE_TARGET_VIEW_FILTER_ID, {
    subFieldName: 'legacyCode',
    operand: 'CONTAINS',
  }),
  buildViewFilterRow(EMPTINESS_VIEW_FILTER_ID, {
    subFieldName: null,
    operand: 'IS_NOT_EMPTY',
  }),
];

const buildJsonStoredFilterRow = (
  ownerId: string,
  { subFieldName, operand }: { subFieldName: string | null; operand: string },
): StoredFilterRowFixture & { ownerId: string } => ({
  ownerId,
  fieldMetadataId: POLICIES_FIELD_ID,
  relationTargetFieldMetadataId: null,
  subFieldName,
  operand,
  value: PHI_FILTER_VALUE,
});

const getWrittenRowCount = (sql: string, parameters: unknown[]) => {
  const [, rows] = parameters;

  if (sql.includes('jsonb_to_recordset') && typeof rows === 'string') {
    return (JSON.parse(rows) as unknown[]).length;
  }

  return Array.isArray(rows) ? rows.length : 0;
};

const isWrite = (sql: string) => /^\s*(UPDATE|DELETE)\b/.test(sql);

const setup = async ({
  viewFilterRows = [],
  widgetRows = [],
  workflowVersionRows = [],
  workspaceWorkflowVersionRows = [],
  hasWorkspaceWorkflowVersionTable = false,
}: {
  viewFilterRows?: (StoredFilterRowFixture & { id: string })[];
  widgetRows?: (StoredFilterRowFixture & { ownerId: string })[];
  workflowVersionRows?: (StoredFilterRowFixture & { ownerId: string })[];
  workspaceWorkflowVersionRows?: (StoredFilterRowFixture & {
    ownerId: string;
  })[];
  hasWorkspaceWorkflowVersionTable?: boolean;
} = {}) => {
  const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
    if (isWrite(sql)) {
      return [[], getWrittenRowCount(sql, parameters)];
    }

    if (sql.includes('to_regclass')) {
      return [{ exists: hasWorkspaceWorkflowVersionTable }];
    }

    if (sql.includes('FROM core."viewFilter"')) {
      return viewFilterRows;
    }

    if (sql.includes('FROM core."pageLayoutWidget"')) {
      return widgetRows;
    }

    if (sql.includes('FROM core."workflowVersion"')) {
      return workflowVersionRows;
    }

    if (sql.includes(WORKSPACE_WORKFLOW_VERSION_TABLE_PREFIX)) {
      return workspaceWorkflowVersionRows;
    }

    return [];
  });
  const getOrRecompute = jest.fn(async () => ({
    flatFieldMetadataMaps: buildFlatFieldMetadataMaps(),
  }));
  const invalidateAndRecompute = jest.fn();

  const module = await Test.createTestingModule({
    providers: [
      OmniaMigrateOneToManyViewFiltersCommand,
      { provide: WorkspaceIteratorService, useValue: {} },
      {
        provide: WorkspaceCacheService,
        useValue: { getOrRecompute, invalidateAndRecompute },
      },
      { provide: getDataSourceToken(), useValue: { query } },
    ],
  }).compile();

  const command = module.get(OmniaMigrateOneToManyViewFiltersCommand);

  const logSpy = jest.spyOn(command['logger'], 'log').mockImplementation();
  const warnSpy = jest.spyOn(command['logger'], 'warn').mockImplementation();

  const run = (dryRun = false) =>
    command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun },
      index: 0,
      total: 1,
    });

  const findWrite = (predicate: (sql: string) => boolean) =>
    query.mock.calls.find(([sql]) => isWrite(sql) && predicate(sql));

  const loggedMessages = () =>
    [...logSpy.mock.calls, ...warnSpy.mock.calls].map(([message]) => message);

  return { run, query, invalidateAndRecompute, findWrite, loggedMessages };
};

describe('OmniaMigrateOneToManyViewFiltersCommand', () => {
  it('points a sub-field filter at its relation target and clears the sub-field name', async () => {
    const { run, findWrite } = await setup({
      viewFilterRows: LEGACY_VIEW_FILTER_ROWS,
    });

    await run();

    const relationTargetUpdate = findWrite((sql) =>
      sql.includes('jsonb_to_recordset'),
    );

    expect(relationTargetUpdate?.[0]).toContain(
      `SET "relationTargetFieldMetadataId" = "relationTarget"."relationTargetFieldMetadataId",
           "subFieldName" = NULL`,
    );
    expect(relationTargetUpdate?.[1]).toEqual([
      WORKSPACE_ID,
      JSON.stringify([
        {
          id: TRAVERSAL_VIEW_FILTER_ID,
          subFieldName: 'status',
          relationTargetFieldMetadataId: POLICY_STATUS_FIELD_ID,
        },
      ]),
    ]);
  });

  it('clears the stray sub-field name of a has any / has no filter', async () => {
    const { run, findWrite } = await setup({
      viewFilterRows: LEGACY_VIEW_FILTER_ROWS,
    });

    await run();

    const subFieldNameUpdate = findWrite(
      (sql) =>
        sql.startsWith('UPDATE') &&
        !sql.includes('jsonb_to_recordset') &&
        sql.includes(`operand IN ('IS_EMPTY', 'IS_NOT_EMPTY')`),
    );

    expect(subFieldNameUpdate?.[0]).toContain('SET "subFieldName" = NULL');
    expect(subFieldNameUpdate?.[1]).toEqual([
      WORKSPACE_ID,
      [STRAY_SUB_FIELD_VIEW_FILTER_ID],
    ]);
  });

  it('deletes a filter by record that can never validate and recomputes every map aggregating view filter ids', async () => {
    const { run, findWrite, invalidateAndRecompute } = await setup({
      viewFilterRows: LEGACY_VIEW_FILTER_ROWS,
    });

    await run();

    const deletion = findWrite((sql) => sql.startsWith('DELETE'));

    expect(deletion?.[0]).toContain(`operand IN ('IS', 'IS_NOT')`);
    expect(deletion?.[1]).toEqual([WORKSPACE_ID, [BY_RECORD_VIEW_FILTER_ID]]);
    expect(invalidateAndRecompute).toHaveBeenCalledTimes(1);
    expect(invalidateAndRecompute).toHaveBeenCalledWith(WORKSPACE_ID, [
      'flatViewFilterMaps',
      'flatViewMaps',
      'flatViewFilterGroupMaps',
      'flatFieldMetadataMaps',
      'flatFieldMetadataMapsOrm',
    ]);
  });

  it('leaves filters whose target is a one-to-many relation or an inactive field for a manual fix', async () => {
    const { run, query, loggedMessages } = await setup({
      viewFilterRows: LEGACY_VIEW_FILTER_ROWS,
    });

    await run();

    const writtenParameters = JSON.stringify(
      query.mock.calls
        .filter(([sql]) => isWrite(sql))
        .map(([, parameters]) => parameters),
    );

    for (const viewFilterId of [
      TO_MANY_TARGET_VIEW_FILTER_ID,
      INACTIVE_TARGET_VIEW_FILTER_ID,
      EMPTINESS_VIEW_FILTER_ID,
    ]) {
      expect(writtenParameters).not.toContain(viewFilterId);
    }

    expect(
      loggedMessages().some((message) =>
        message.includes(TO_MANY_TARGET_VIEW_FILTER_ID),
      ),
    ).toBe(true);
    expect(
      loggedMessages().some((message) =>
        message.includes(INACTIVE_TARGET_VIEW_FILTER_ID),
      ),
    ).toBe(true);
  });

  it('recomputes only the view filter maps when no filter is deleted', async () => {
    const { run, invalidateAndRecompute } = await setup({
      viewFilterRows: [LEGACY_VIEW_FILTER_ROWS[0]],
    });

    await run();

    expect(invalidateAndRecompute).toHaveBeenCalledWith(WORKSPACE_ID, [
      'flatViewFilterMaps',
    ]);
  });

  it('writes nothing and keeps the caches on a dry run', async () => {
    const { run, query, invalidateAndRecompute, loggedMessages } = await setup({
      viewFilterRows: LEGACY_VIEW_FILTER_ROWS,
    });

    await run(true);

    expect(query.mock.calls.some(([sql]) => isWrite(sql))).toBe(false);
    expect(invalidateAndRecompute).not.toHaveBeenCalled();
    expect(
      loggedMessages().some(
        (message) =>
          message.startsWith('[DRY RUN]') &&
          message.includes(TRAVERSAL_VIEW_FILTER_ID),
      ),
    ).toBe(true);
  });

  it('changes nothing once every one-to-many filter is in the v2.58 shape', async () => {
    const { run, query, invalidateAndRecompute } = await setup({
      viewFilterRows: [LEGACY_VIEW_FILTER_ROWS[5]],
    });

    await run();

    expect(query.mock.calls.some(([sql]) => isWrite(sql))).toBe(false);
    expect(invalidateAndRecompute).not.toHaveBeenCalled();
  });

  it('only reports chart and workflow filters in the old shape', async () => {
    const { run, query, invalidateAndRecompute, loggedMessages } = await setup({
      widgetRows: [
        buildJsonStoredFilterRow(CHART_WIDGET_ID, {
          subFieldName: 'status',
          operand: 'IS',
        }),
      ],
      workflowVersionRows: [
        buildJsonStoredFilterRow(WORKFLOW_VERSION_ID, {
          subFieldName: null,
          operand: 'IS_NOT',
        }),
      ],
      workspaceWorkflowVersionRows: [
        buildJsonStoredFilterRow(WORKSPACE_WORKFLOW_VERSION_ID, {
          subFieldName: 'status',
          operand: 'IS_NOT_EMPTY',
        }),
      ],
      hasWorkspaceWorkflowVersionTable: true,
    });

    await run();

    expect(query.mock.calls.some(([sql]) => isWrite(sql))).toBe(false);
    expect(invalidateAndRecompute).not.toHaveBeenCalled();

    for (const ownerId of [
      CHART_WIDGET_ID,
      WORKFLOW_VERSION_ID,
      WORKSPACE_WORKFLOW_VERSION_ID,
    ]) {
      expect(
        loggedMessages().some((message) => message.includes(ownerId)),
      ).toBe(true);
    }
  });

  it('skips the workspace workflow version table once it is gone', async () => {
    const { run, query } = await setup({
      hasWorkspaceWorkflowVersionTable: false,
    });

    await run();

    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes(WORKSPACE_WORKFLOW_VERSION_TABLE_PREFIX),
      ),
    ).toBe(false);
  });

  it('never reads or logs a filter value', async () => {
    const { run, query, loggedMessages } = await setup({
      viewFilterRows: LEGACY_VIEW_FILTER_ROWS,
      widgetRows: [
        buildJsonStoredFilterRow(CHART_WIDGET_ID, {
          subFieldName: 'status',
          operand: 'IS',
        }),
      ],
      workflowVersionRows: [
        buildJsonStoredFilterRow(WORKFLOW_VERSION_ID, {
          subFieldName: null,
          operand: 'IS',
        }),
      ],
    });

    await run();
    await run(true);

    expect(loggedMessages().length).toBeGreaterThan(0);

    for (const message of loggedMessages()) {
      expect(message).not.toContain(PHI_FILTER_VALUE);
    }

    for (const [sql] of query.mock.calls) {
      expect(sql).not.toMatch(/\bvalue\b/);
    }
  });
});
