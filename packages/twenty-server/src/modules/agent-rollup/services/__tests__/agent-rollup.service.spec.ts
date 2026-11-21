import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { QUERY_MAX_RECORDS } from 'twenty-shared/constants';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { In } from 'typeorm';

import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import {
  TwentyOrmException,
  TwentyOrmExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { AgentRollupService } from 'src/modules/agent-rollup/services/agent-rollup.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const TIME_CARD_OBJECT_ID = 'time-card-object-id';
const TIME_CARD_AGENT_FIELD_ID = 'time-card-agent-field-id';

const ROLLUP_FIELD_NAMES = [
  'totalPolicies',
  'placementRate6mo',
  'billableHours',
  'offPhoneHours',
  'qaEvents',
  'qaEvents30d',
  'qaPassed',
  'qaFailed',
  'qaFailedRate',
  'qaLatestScore',
  'qaAvgScore30d',
  'qaSales30d',
  'qaCoachingRate',
];

const CHAINABLE_QUERY_BUILDER_METHOD_NAMES = [
  'select',
  'addSelect',
  'where',
  'andWhere',
  'setParameters',
  'groupBy',
  'orderBy',
  'addOrderBy',
  'distinctOn',
] as const;

type QueryBuilderMock = Record<
  (typeof CHAINABLE_QUERY_BUILDER_METHOD_NAMES)[number] | 'getRawMany',
  jest.Mock
>;

type RawRow = Record<string, unknown>;

const buildQueryBuilderMock = (rawRows: RawRow[] = []): QueryBuilderMock => {
  const queryBuilder = {
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  } as QueryBuilderMock;

  for (const methodName of CHAINABLE_QUERY_BUILDER_METHOD_NAMES) {
    queryBuilder[methodName] = jest.fn().mockReturnValue(queryBuilder);
  }

  return queryBuilder;
};

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
) =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const buildAgentProfileNumberField = (name: string): FlatFieldMetadata =>
  getFlatFieldMetadataMock({
    id: `agent-profile-${name}-field-id`,
    universalIdentifier: `agent-profile-${name}-field-id`,
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    type: FieldMetadataType.NUMBER,
    name,
  });

const buildMetadataMaps = ({
  hasAgentProfileObject = true,
  agentProfileFieldNames = ROLLUP_FIELD_NAMES,
  timeCardAgentJoinColumnName,
}: {
  hasAgentProfileObject?: boolean;
  agentProfileFieldNames?: string[];
  timeCardAgentJoinColumnName?: string;
} = {}) => {
  const agentProfileFields = agentProfileFieldNames.map(
    buildAgentProfileNumberField,
  );
  const timeCardFields = isDefined(timeCardAgentJoinColumnName)
    ? [
        getFlatFieldMetadataMock({
          id: TIME_CARD_AGENT_FIELD_ID,
          universalIdentifier: TIME_CARD_AGENT_FIELD_ID,
          objectMetadataId: TIME_CARD_OBJECT_ID,
          type: FieldMetadataType.RELATION,
          name: 'agent',
          relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
          settings: {
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: timeCardAgentJoinColumnName,
          },
        }),
      ]
    : [];

  const flatObjectMetadatas: FlatObjectMetadata[] = [];

  if (hasAgentProfileObject) {
    flatObjectMetadatas.push(
      getFlatObjectMetadataMock({
        id: AGENT_PROFILE_OBJECT_ID,
        universalIdentifier: AGENT_PROFILE_OBJECT_ID,
        nameSingular: 'agentProfile',
        namePlural: 'agentProfiles',
        fieldIds: agentProfileFields.map(({ id }) => id),
      }),
    );
  }

  if (timeCardFields.length > 0) {
    flatObjectMetadatas.push(
      getFlatObjectMetadataMock({
        id: TIME_CARD_OBJECT_ID,
        universalIdentifier: TIME_CARD_OBJECT_ID,
        nameSingular: 'timeCard',
        namePlural: 'timeCards',
        fieldIds: timeCardFields.map(({ id }) => id),
      }),
    );
  }

  return {
    flatObjectMetadataMaps: buildFlatEntityMaps(flatObjectMetadatas),
    flatFieldMetadataMaps: buildFlatEntityMaps([
      ...agentProfileFields,
      ...timeCardFields,
    ]),
  };
};

const buildAgentMetrics = (
  overrides: Record<string, number | string | null> = {},
) => ({
  totalPolicies: 0,
  placementRate6mo: 0,
  billableHours: 0,
  offPhoneHours: 0,
  qaEvents: 0,
  qaEvents30d: 0,
  qaPassed: 0,
  qaFailed: 0,
  qaFailedRate: null,
  qaLatestScore: null,
  qaAvgScore30d: null,
  qaSales30d: 0,
  qaCoachingRate: null,
  ...overrides,
});

const buildNeverComputedAgentProfile = (id: string) => ({
  id,
  ...Object.fromEntries(ROLLUP_FIELD_NAMES.map((name) => [name, null])),
});

const buildRepositories = ({
  policyRows = [],
  timeCardRows = [],
  callRows = [],
  qaRows = [],
  latestScoreRows = [],
  taskLinkRows = [],
  taskRows = [],
  storedAgentProfiles = [],
  hasQaScorecardObject = true,
}: {
  policyRows?: RawRow[];
  timeCardRows?: RawRow[];
  callRows?: RawRow[];
  qaRows?: RawRow[];
  latestScoreRows?: RawRow[];
  taskLinkRows?: RawRow[];
  taskRows?: RawRow[];
  storedAgentProfiles?: RawRow[];
  hasQaScorecardObject?: boolean;
} = {}) => {
  const policyQueryBuilder = buildQueryBuilderMock(policyRows);
  const timeCardQueryBuilder = buildQueryBuilderMock(timeCardRows);
  const callQueryBuilder = buildQueryBuilderMock(callRows);
  const [qaQueryBuilder, latestScoreQueryBuilder, taskLinkQueryBuilder] = [
    qaRows,
    latestScoreRows,
    taskLinkRows,
  ].map((rawRows) => buildQueryBuilderMock(rawRows));
  const taskQueryBuilder = buildQueryBuilderMock(taskRows);

  const agentProfileRepository = {
    find: jest.fn().mockResolvedValue(storedAgentProfiles),
    updateMany: jest.fn(async (updates: unknown[]) => ({
      affected: updates.length,
    })),
  };

  const repositoriesByObjectName: Record<string, object> = {
    policy: { createQueryBuilder: jest.fn(() => policyQueryBuilder) },
    timeCard: { createQueryBuilder: jest.fn(() => timeCardQueryBuilder) },
    call: { createQueryBuilder: jest.fn(() => callQueryBuilder) },
    task: { createQueryBuilder: jest.fn(() => taskQueryBuilder) },
    agentProfile: agentProfileRepository,
  };

  if (hasQaScorecardObject) {
    repositoriesByObjectName.qaScorecard = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(qaQueryBuilder)
        .mockReturnValueOnce(latestScoreQueryBuilder)
        .mockReturnValueOnce(taskLinkQueryBuilder),
    };
  }

  return {
    repositoriesByObjectName,
    agentProfileRepository,
    timeCardQueryBuilder,
    latestScoreQueryBuilder,
    taskQueryBuilder,
  };
};

const setUpService = async ({
  metadataMaps = buildMetadataMaps(),
  repositories = buildRepositories(),
}: {
  metadataMaps?: ReturnType<typeof buildMetadataMaps>;
  repositories?: ReturnType<typeof buildRepositories>;
} = {}) => {
  const createManyFields = jest.fn().mockResolvedValue([]);
  const executeInWorkspaceContext = jest.fn((callback: () => unknown) =>
    callback(),
  );
  const getRepositoryWithoutPermissionChecks = jest.fn((objectName: string) => {
    const repository = repositories.repositoriesByObjectName[objectName];

    if (!isDefined(repository)) {
      throw new TwentyOrmException(
        `Object "${objectName}" does not exist in this workspace`,
        TwentyOrmExceptionCode.UNKNOWN_OBJECT,
      );
    }

    return repository;
  });

  const module = await Test.createTestingModule({
    providers: [
      AgentRollupService,
      { provide: FieldMetadataService, useValue: { createManyFields } },
      {
        provide: WorkspaceCacheService,
        useValue: { getOrRecompute: jest.fn().mockResolvedValue(metadataMaps) },
      },
      {
        provide: WorkspaceOrmManager,
        useValue: {
          executeInWorkspaceContext,
          getRepositoryWithoutPermissionChecks,
        },
      },
    ],
  }).compile();

  return {
    service: module.get(AgentRollupService),
    createManyFields,
    executeInWorkspaceContext,
    getRepositoryWithoutPermissionChecks,
  };
};

describe('AgentRollupService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should write only the agents whose metrics changed, without emitting events', async () => {
    const repositories = buildRepositories({
      policyRows: [
        {
          agentId: 'agent-a',
          total: '4',
          written: '2',
          placed: '1',
          sales30d: '1',
        },
        {
          agentId: 'agent-b',
          total: '2',
          written: '0',
          placed: '0',
          sales30d: '0',
        },
      ],
      storedAgentProfiles: [
        {
          id: 'agent-a',
          ...buildAgentMetrics({
            totalPolicies: 3,
            placementRate6mo: 50,
            qaSales30d: 1,
          }),
        },
        // Numeric columns can come back as strings
        { id: 'agent-b', ...buildAgentMetrics({ totalPolicies: '2' }) },
      ],
    });
    const {
      service,
      createManyFields,
      executeInWorkspaceContext,
      getRepositoryWithoutPermissionChecks,
    } = await setUpService({ repositories });

    const updatedAgentCount = await service.computeWorkspace(WORKSPACE_ID);

    expect(updatedAgentCount).toBe(1);
    expect(createManyFields).not.toHaveBeenCalled();
    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      { type: 'system', workspace: { id: WORKSPACE_ID } },
    );
    expect(getRepositoryWithoutPermissionChecks).toHaveBeenCalledWith(
      'agentProfile',
      { shouldSkipEventEmission: true },
    );
    expect(repositories.agentProfileRepository.find).toHaveBeenCalledWith({
      where: { id: In(['agent-a', 'agent-b']) },
      select: ['id', ...ROLLUP_FIELD_NAMES],
    });
    expect(
      repositories.agentProfileRepository.updateMany,
    ).toHaveBeenCalledTimes(1);
    expect(repositories.agentProfileRepository.updateMany).toHaveBeenCalledWith(
      [
        {
          criteria: 'agent-a',
          partialEntity: buildAgentMetrics({
            totalPolicies: 4,
            placementRate6mo: 50,
            qaSales30d: 1,
          }),
        },
      ],
    );
  });

  it('should not write when every stored metric already matches', async () => {
    const repositories = buildRepositories({
      policyRows: [
        {
          agentId: 'agent-a',
          total: '1',
          written: '0',
          placed: '0',
          sales30d: '0',
        },
      ],
      storedAgentProfiles: [
        { id: 'agent-a', ...buildAgentMetrics({ totalPolicies: 1 }) },
      ],
    });
    const { service } = await setUpService({ repositories });

    await expect(service.computeWorkspace(WORKSPACE_ID)).resolves.toBe(0);
    expect(
      repositories.agentProfileRepository.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('should skip agents that no longer have a profile', async () => {
    const repositories = buildRepositories({
      policyRows: [
        {
          agentId: 'agent-a',
          total: '1',
          written: '0',
          placed: '0',
          sales30d: '0',
        },
        {
          agentId: 'deleted-agent',
          total: '5',
          written: '0',
          placed: '0',
          sales30d: '0',
        },
      ],
      storedAgentProfiles: [buildNeverComputedAgentProfile('agent-a')],
    });
    const { service } = await setUpService({ repositories });

    await expect(service.computeWorkspace(WORKSPACE_ID)).resolves.toBe(1);
    expect(repositories.agentProfileRepository.updateMany).toHaveBeenCalledWith(
      [
        {
          criteria: 'agent-a',
          partialEntity: buildAgentMetrics({ totalPolicies: 1 }),
        },
      ],
    );
  });

  it('should batch the writes by QUERY_MAX_RECORDS', async () => {
    const agentIds = Array.from(
      { length: QUERY_MAX_RECORDS + 1 },
      (_, index) => `agent-${index}`,
    );
    const repositories = buildRepositories({
      policyRows: agentIds.map((agentId) => ({
        agentId,
        total: '1',
        written: '0',
        placed: '0',
        sales30d: '0',
      })),
      storedAgentProfiles: agentIds.map(buildNeverComputedAgentProfile),
    });
    const { service } = await setUpService({ repositories });

    const updatedAgentCount = await service.computeWorkspace(WORKSPACE_ID);

    const { updateMany } = repositories.agentProfileRepository;

    expect(updatedAgentCount).toBe(QUERY_MAX_RECORDS + 1);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0][0]).toHaveLength(QUERY_MAX_RECORDS);
    expect(updateMany.mock.calls[1][0]).toEqual([
      {
        criteria: `agent-${QUERY_MAX_RECORDS}`,
        partialEntity: buildAgentMetrics({ totalPolicies: 1 }),
      },
    ]);
  });

  it('should read time cards through the join column of the timeCard agent relation', async () => {
    const repositories = buildRepositories({
      timeCardRows: [
        { agentId: 'agent-a', billableHours: '7.25', loginSeconds: '7200' },
      ],
      callRows: [{ agentId: 'agent-a', talkSeconds: '1800' }],
      storedAgentProfiles: [buildNeverComputedAgentProfile('agent-a')],
    });
    const { service } = await setUpService({
      metadataMaps: buildMetadataMaps({
        timeCardAgentJoinColumnName: 'legacyAgentId',
      }),
      repositories,
    });

    await service.computeWorkspace(WORKSPACE_ID);

    const { timeCardQueryBuilder } = repositories;

    expect(timeCardQueryBuilder.select).toHaveBeenCalledWith(
      '"tc"."legacyAgentId"',
      'agentId',
    );
    expect(timeCardQueryBuilder.where).toHaveBeenCalledWith(
      '"tc"."legacyAgentId" IS NOT NULL',
    );
    expect(timeCardQueryBuilder.groupBy).toHaveBeenCalledWith(
      '"tc"."legacyAgentId"',
    );
    expect(repositories.agentProfileRepository.updateMany).toHaveBeenCalledWith(
      [
        {
          criteria: 'agent-a',
          partialEntity: buildAgentMetrics({
            billableHours: 7.3,
            offPhoneHours: 1.5,
          }),
        },
      ],
    );
  });

  it('should skip time card rollups when timeCard has no agent relation', async () => {
    const { service, getRepositoryWithoutPermissionChecks } =
      await setUpService();

    await service.computeWorkspace(WORKSPACE_ID);

    expect(getRepositoryWithoutPermissionChecks).not.toHaveBeenCalledWith(
      'timeCard',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('timeCard rollups skipped'),
    );
  });

  it('should take the latest QA score per agent with DISTINCT ON and compute the QA rates', async () => {
    const repositories = buildRepositories({
      qaRows: [
        {
          agentId: 'agent-a',
          events: '3',
          events30d: '2',
          passed: '2',
          failed: '1',
          avgScore30: '81.25',
        },
      ],
      latestScoreRows: [{ agentId: 'agent-a', score: '90' }],
      taskLinkRows: [
        { agentId: 'agent-a', taskId: 'task-1' },
        { agentId: 'agent-a', taskId: 'task-2' },
      ],
      taskRows: [
        { id: 'task-1', status: 'DONE' },
        { id: 'task-2', status: 'TODO' },
      ],
      storedAgentProfiles: [buildNeverComputedAgentProfile('agent-a')],
    });
    const { service } = await setUpService({ repositories });

    await service.computeWorkspace(WORKSPACE_ID);

    expect(
      repositories.latestScoreQueryBuilder.distinctOn,
    ).toHaveBeenCalledWith(['qa.agentId']);
    expect(repositories.taskQueryBuilder.where).toHaveBeenCalledWith(
      '"task"."id" IN (:...taskIds)',
      { taskIds: ['task-1', 'task-2'] },
    );
    expect(repositories.agentProfileRepository.updateMany).toHaveBeenCalledWith(
      [
        {
          criteria: 'agent-a',
          partialEntity: buildAgentMetrics({
            qaEvents: 3,
            qaEvents30d: 2,
            qaPassed: 2,
            qaFailed: 1,
            qaFailedRate: 33.3,
            qaAvgScore30d: 81.3,
            qaLatestScore: 90,
            qaCoachingRate: 50,
          }),
        },
      ],
    );
  });

  it('should keep the other rollups when the QA app is not installed', async () => {
    const repositories = buildRepositories({
      policyRows: [
        {
          agentId: 'agent-a',
          total: '1',
          written: '0',
          placed: '0',
          sales30d: '0',
        },
      ],
      storedAgentProfiles: [buildNeverComputedAgentProfile('agent-a')],
      hasQaScorecardObject: false,
    });
    const { service } = await setUpService({ repositories });

    await expect(service.computeWorkspace(WORKSPACE_ID)).resolves.toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      `QA rollups skipped in workspace ${WORKSPACE_ID} (UNKNOWN_OBJECT)`,
    );
  });

  it('should create only the missing rollup fields as NUMBER fields', async () => {
    const { service, createManyFields } = await setUpService({
      metadataMaps: buildMetadataMaps({
        agentProfileFieldNames: ['totalPolicies'],
      }),
    });

    await service.computeWorkspace(WORKSPACE_ID);

    expect(createManyFields).toHaveBeenCalledTimes(1);

    const [{ createFieldInputs, workspaceId }] = createManyFields.mock.calls[0];

    expect(workspaceId).toBe(WORKSPACE_ID);
    expect(createFieldInputs.map(({ name }: { name: string }) => name)).toEqual(
      ROLLUP_FIELD_NAMES.filter((name) => name !== 'totalPolicies'),
    );
    expect(createFieldInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectMetadataId: AGENT_PROFILE_OBJECT_ID,
          type: FieldMetadataType.NUMBER,
          isLabelSyncedWithName: false,
        }),
      ]),
    );
  });

  it('should return 0 without touching records when the workspace has no agentProfile object', async () => {
    const { service, createManyFields, executeInWorkspaceContext } =
      await setUpService({
        metadataMaps: buildMetadataMaps({ hasAgentProfileObject: false }),
      });

    await expect(service.computeWorkspace(WORKSPACE_ID)).resolves.toBe(0);
    expect(createManyFields).not.toHaveBeenCalled();
    expect(executeInWorkspaceContext).not.toHaveBeenCalled();
  });

  it('should log only the ORM code when a write fails', async () => {
    const repositories = buildRepositories({
      policyRows: [
        {
          agentId: 'agent-a',
          total: '1',
          written: '0',
          placed: '0',
          sales30d: '0',
        },
      ],
      storedAgentProfiles: [buildNeverComputedAgentProfile('agent-a')],
    });

    repositories.agentProfileRepository.updateMany.mockRejectedValue(
      new TwentyOrmException(
        'invalid input syntax for type double precision: "Jane Doe"',
        TwentyOrmExceptionCode.INVALID_INPUT,
      ),
    );

    const { service } = await setUpService({ repositories });

    await expect(service.computeWorkspace(WORKSPACE_ID)).resolves.toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      `Rollup write failed for 1 agent(s) in workspace ${WORKSPACE_ID} (INVALID_INPUT)`,
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('Jane Doe');
  });
});
