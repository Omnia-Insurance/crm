import { Test } from '@nestjs/testing';

import {
  FeatureFlagKey,
  FieldMetadataType,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import { type DataSource } from 'typeorm';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaTranslateScopedRowLevelPermissionsCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794337540400-omnia-translate-scoped-row-level-permissions.command';
import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const WORKSPACE_ID = '20202020-1000-4000-8000-000000000001';
const APPLICATION_ID = '20202020-1000-4000-8000-000000000011';
const ROLE_ID = '20202020-2000-4000-8000-000000000001';
const WORKSPACE_MEMBER_OBJECT_ID = '20202020-3000-4000-8000-000000000001';
const POLICY_OBJECT_ID = '20202020-3000-4000-8000-000000000003';
const AGENT_PROFILE_OBJECT_ID = '20202020-3000-4000-8000-000000000005';
const WORKSPACE_MEMBER_ID_FIELD_ID = '20202020-4000-4000-8000-000000000001';
const POLICY_AGENT_FIELD_ID = '20202020-4000-4000-8000-000000000002';
const AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID =
  '20202020-4000-4000-8000-000000000003';
const POLICY_STATUS_FIELD_ID = '20202020-4000-4000-8000-000000000004';

const REQUIRED_COLUMNS = [
  ['rowLevelPermissionPredicate', 'scope'],
  ['rowLevelPermissionPredicateGroup', 'scope'],
  ['rowLevelPermissionRule', 'id'],
  ['rowLevelPermissionPredicate', 'rowLevelPermissionRuleId'],
  ['rowLevelPermissionPredicate', 'relationFieldMetadataId'],
  ['rowLevelPermissionPredicateGroup', 'rowLevelPermissionRuleId'],
  ['fieldPermission', 'rowLevelPermissionRuleId'],
  ['fieldPermission', 'rowLevelPermissionPredicateGroupId'],
].map(([tableName, columnName]) => ({ tableName, columnName }));

const buildPredicateRow = ({
  id,
  fieldMetadataId,
  workspaceMemberFieldMetadataId,
  operand,
  scope,
  rowLevelPermissionRuleId = null,
}: {
  id: string;
  fieldMetadataId: string;
  workspaceMemberFieldMetadataId: string | null;
  operand: RowLevelPermissionPredicateOperand;
  scope: string;
  rowLevelPermissionRuleId?: string | null;
}) => ({
  id,
  universalIdentifier: id.replace('5000', '5100'),
  applicationId: APPLICATION_ID,
  roleId: ROLE_ID,
  objectMetadataId: POLICY_OBJECT_ID,
  fieldMetadataId,
  relationFieldMetadataId: null,
  workspaceMemberFieldMetadataId,
  operand,
  subFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
  rowLevelPermissionRuleId,
  scope,
});

const AGENT_IS_ME_PREDICATE_ROW = buildPredicateRow({
  id: '20202020-5000-4000-8000-000000000001',
  fieldMetadataId: POLICY_AGENT_FIELD_ID,
  workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
  operand: RowLevelPermissionPredicateOperand.IS,
  scope: 'WRITE',
});

const STATUS_NOT_EMPTY_PREDICATE_ROW = buildPredicateRow({
  id: '20202020-5000-4000-8000-000000000002',
  fieldMetadataId: POLICY_STATUS_FIELD_ID,
  workspaceMemberFieldMetadataId: null,
  operand: RowLevelPermissionPredicateOperand.IS_NOT_EMPTY,
  scope: 'ALL',
});

const buildRowsByTable = (
  predicateRows: ReturnType<typeof buildPredicateRow>[],
): Record<string, unknown[]> => ({
  '"core"."rowLevelPermissionPredicate"': predicateRows,
  '"core"."rowLevelPermissionPredicateGroup"': [],
  '"core"."rowLevelPermissionRule"': [],
  '"core"."role"': [
    {
      id: ROLE_ID,
      universalIdentifier: '20202020-2000-4000-8000-000000000002',
      applicationId: APPLICATION_ID,
      label: 'Member',
    },
  ],
  '"core"."objectMetadata"': [
    {
      id: WORKSPACE_MEMBER_OBJECT_ID,
      universalIdentifier: '20202020-3000-4000-8000-000000000002',
      nameSingular: 'workspaceMember',
    },
    {
      id: POLICY_OBJECT_ID,
      universalIdentifier: '20202020-3000-4000-8000-000000000004',
      nameSingular: 'policy',
    },
    {
      id: AGENT_PROFILE_OBJECT_ID,
      universalIdentifier: '20202020-3000-4000-8000-000000000006',
      nameSingular: 'agentProfile',
    },
  ],
  '"core"."fieldMetadata"': [
    {
      id: WORKSPACE_MEMBER_ID_FIELD_ID,
      objectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
      name: 'id',
      type: FieldMetadataType.UUID,
      isActive: true,
      relationTargetObjectMetadataId: null,
      relationType: null,
    },
    {
      id: POLICY_AGENT_FIELD_ID,
      objectMetadataId: POLICY_OBJECT_ID,
      name: 'agent',
      type: FieldMetadataType.RELATION,
      isActive: true,
      relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
      relationType: RelationType.MANY_TO_ONE,
    },
    {
      id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
      objectMetadataId: AGENT_PROFILE_OBJECT_ID,
      name: 'workspaceMember',
      type: FieldMetadataType.RELATION,
      isActive: true,
      relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
      relationType: RelationType.MANY_TO_ONE,
    },
    {
      id: POLICY_STATUS_FIELD_ID,
      objectMetadataId: POLICY_OBJECT_ID,
      name: 'status',
      type: FieldMetadataType.SELECT,
      isActive: true,
      relationTargetObjectMetadataId: null,
      relationType: null,
    },
  ],
  '"core"."application"': [
    {
      id: APPLICATION_ID,
      universalIdentifier: '20202020-1000-4000-8000-000000000012',
    },
  ],
  '"core"."fieldPermission"': [],
  '"core"."featureFlag"': [],
});

const FULL_POLICY_RECORDS_PERMISSIONS = {
  canCreateAllRecords: true,
  canReadAllRecords: true,
  canUpdateAllRecords: true,
  canSoftDeleteAllRecords: true,
  canDestroyAllRecords: true,
  unreadableFields: [],
  uneditableFields: [],
};

const setup = async ({
  hasScopeColumn = true,
  predicateRows = [AGENT_IS_ME_PREDICATE_ROW],
  policyRecordsPermissions = FULL_POLICY_RECORDS_PERMISSIONS,
}: {
  hasScopeColumn?: boolean;
  predicateRows?: ReturnType<typeof buildPredicateRow>[];
  policyRecordsPermissions?: typeof FULL_POLICY_RECORDS_PERMISSIONS;
} = {}) => {
  const rowsByTable = buildRowsByTable(predicateRows);
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('"information_schema"."columns"')) {
      return hasScopeColumn ? REQUIRED_COLUMNS : [];
    }

    const table = Object.keys(rowsByTable).find((tableName) =>
      sql.includes(`FROM ${tableName}`),
    );

    return table === undefined ? [] : rowsByTable[table];
  });
  const transactionQuery = jest.fn().mockResolvedValue([]);
  const transaction = jest.fn(
    async (
      runInTransaction: (entityManager: {
        query: typeof transactionQuery;
      }) => Promise<void>,
    ) => runInTransaction({ query: transactionQuery }),
  );
  const invalidateAndRecompute = jest.fn();
  const getOrRecompute = jest.fn().mockResolvedValue({
    rolesPermissions: {
      [ROLE_ID]: {
        canReadAllRecords: true,
        canUpdateAllRecords: true,
        canSoftDeleteAllRecords: true,
        canDestroyAllRecords: true,
        objects: {
          [POLICY_OBJECT_ID]: policyRecordsPermissions,
        },
      },
    },
  });

  const module = await Test.createTestingModule({
    providers: [
      OmniaTranslateScopedRowLevelPermissionsCommand,
      { provide: WorkspaceIteratorService, useValue: {} },
      {
        provide: WorkspaceCacheService,
        useValue: { invalidateAndRecompute, getOrRecompute },
      },
    ],
  }).compile();

  const command = module.get(OmniaTranslateScopedRowLevelPermissionsCommand);

  const run = ({
    dryRun = false,
    mergeMixedScopesFailClosed,
  }: { dryRun?: boolean; mergeMixedScopesFailClosed?: boolean } = {}) =>
    command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun, mergeMixedScopesFailClosed },
      dataSource: { query, transaction } as unknown as DataSource,
      index: 0,
      total: 1,
    });

  return { run, query, transaction, transactionQuery, invalidateAndRecompute };
};

const findWrite = (
  transactionQuery: jest.Mock,
  statementStart: string,
): unknown[] | undefined =>
  transactionQuery.mock.calls.find(
    ([sql]) =>
      typeof sql === 'string' && sql.trimStart().startsWith(statementStart),
  );

describe('OmniaTranslateScopedRowLevelPermissionsCommand', () => {
  it('does nothing when the workspace never had the scope column', async () => {
    const { run, query, transaction, invalidateAndRecompute } = await setup({
      hasScopeColumn: false,
    });

    await run();

    expect(query).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
    expect(invalidateAndRecompute).not.toHaveBeenCalled();
  });

  it('writes the rule, the hop, the object grants and the hop flag in one transaction, then recomputes the caches', async () => {
    const { run, transaction, transactionQuery, invalidateAndRecompute } =
      await setup();

    await run();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(
      findWrite(
        transactionQuery,
        'INSERT INTO "core"."rowLevelPermissionRule"',
      ),
    ).toBeDefined();
    expect(
      findWrite(
        transactionQuery,
        'UPDATE "core"."rowLevelPermissionPredicate"',
      ),
    ).toBeDefined();

    const objectPermissionWrite = findWrite(
      transactionQuery,
      'INSERT INTO "core"."objectPermission"',
    );

    expect(objectPermissionWrite?.[0]).toContain(
      'ON CONFLICT ("objectMetadataId", "roleId") DO UPDATE',
    );
    expect(objectPermissionWrite?.[0]).not.toContain('showInSidebar');
    expect(objectPermissionWrite?.[0]).not.toContain('editWindowMinutes');
    expect(objectPermissionWrite?.[1]).toEqual([
      WORKSPACE_ID,
      expect.any(Array),
      [APPLICATION_ID],
      [ROLE_ID],
      [POLICY_OBJECT_ID],
      [false],
      [true],
      [false],
      [false],
      [false],
    ]);
    expect(
      findWrite(transactionQuery, 'INSERT INTO "core"."featureFlag"')?.[1],
    ).toEqual([
      WORKSPACE_ID,
      FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED,
    ]);
    expect(invalidateAndRecompute).toHaveBeenNthCalledWith(1, WORKSPACE_ID, [
      'rolesPermissions',
    ]);
    expect(invalidateAndRecompute).toHaveBeenLastCalledWith(
      WORKSPACE_ID,
      expect.arrayContaining([
        'flatRowLevelPermissionPredicateMaps',
        'flatRowLevelPermissionPredicateGroupMaps',
        'flatRowLevelPermissionRuleMaps',
        'flatObjectPermissionMaps',
        'flatFieldPermissionMaps',
        'flatFieldMetadataMaps',
        'flatFieldMetadataMapsOrm',
        'rolesPermissions',
        'featureFlagsMap',
      ]),
    );
  });

  it('still refreshes the caches on a re-run that finds every pair linked', async () => {
    const { run, transaction, invalidateAndRecompute } = await setup({
      predicateRows: [
        buildPredicateRow({
          id: '20202020-5000-4000-8000-000000000001',
          fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
          workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
          operand: RowLevelPermissionPredicateOperand.IS,
          scope: 'WRITE',
          rowLevelPermissionRuleId: '20202020-8000-4000-8000-000000000001',
        }),
      ],
    });

    await run();

    expect(transaction).not.toHaveBeenCalled();
    expect(invalidateAndRecompute).toHaveBeenLastCalledWith(
      WORKSPACE_ID,
      expect.arrayContaining([
        'flatRowLevelPermissionPredicateMaps',
        'flatRowLevelPermissionRuleMaps',
        'flatObjectPermissionMaps',
        'rolesPermissions',
      ]),
    );
  });

  it('soft-deletes the predicates of a pair whose role cannot write, without a rule', async () => {
    const { run, transactionQuery } = await setup({
      policyRecordsPermissions: {
        ...FULL_POLICY_RECORDS_PERMISSIONS,
        canCreateAllRecords: false,
        canUpdateAllRecords: false,
        canSoftDeleteAllRecords: false,
        canDestroyAllRecords: false,
      },
    });

    await run();

    expect(
      findWrite(
        transactionQuery,
        'INSERT INTO "core"."rowLevelPermissionRule"',
      ),
    ).toBeUndefined();
    expect(
      transactionQuery.mock.calls.find(
        ([sql]) =>
          typeof sql === 'string' && sql.includes('SET "deletedAt" = now()'),
      )?.[1],
    ).toEqual([WORKSPACE_ID, [AGENT_IS_ME_PREDICATE_ROW.id]]);
    expect(
      findWrite(transactionQuery, 'INSERT INTO "core"."featureFlag"'),
    ).toBeUndefined();
  });

  it('plans and reports on a dry run without writing', async () => {
    const { run, transaction, invalidateAndRecompute } = await setup();

    await run({ dryRun: true });

    expect(transaction).not.toHaveBeenCalled();
    expect(invalidateAndRecompute).toHaveBeenCalledTimes(1);
  });

  it('throws before any write when a role and object mixes scopes', async () => {
    const { run, transaction } = await setup({
      predicateRows: [
        AGENT_IS_ME_PREDICATE_ROW,
        STATUS_NOT_EMPTY_PREDICATE_ROW,
      ],
    });

    await expect(run()).rejects.toThrow(
      `role ${ROLE_ID} on object ${POLICY_OBJECT_ID} mixes scopes`,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('merges mixed scopes fail-closed only when the option is passed', async () => {
    const { run, transaction, transactionQuery } = await setup({
      predicateRows: [
        AGENT_IS_ME_PREDICATE_ROW,
        STATUS_NOT_EMPTY_PREDICATE_ROW,
      ],
    });

    await run({ mergeMixedScopesFailClosed: true });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(
      findWrite(transactionQuery, 'INSERT INTO "core"."objectPermission"')?.[1],
    ).toEqual([
      WORKSPACE_ID,
      expect.any(Array),
      [APPLICATION_ID],
      [ROLE_ID],
      [POLICY_OBJECT_ID],
      [false],
      [false],
      [false],
      [false],
      [false],
    ]);
  });
});
