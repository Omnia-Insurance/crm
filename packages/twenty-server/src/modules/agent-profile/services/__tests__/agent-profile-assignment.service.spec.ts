import { Test, type TestingModule } from '@nestjs/testing';

import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { In } from 'typeorm';

import {
  type ApiKeyWorkspaceAuthContext,
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatIndexMetadataMock } from 'src/engine/metadata-modules/flat-index-metadata/__mocks__/get-flat-index-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { AgentProfileAssignmentService } from 'src/modules/agent-profile/services/agent-profile-assignment.service';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const MY_AGENT_PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_AGENT_PROFILE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXISTING_POLICY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NEW_POLICY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const POLICY_OBJECT_ID = 'policy-object-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const POLICY_ID_FIELD_ID = 'policy-id-field-id';
const POLICY_NUMBER_FIELD_ID = 'policy-number-field-id';
const POLICY_AGENT_FIELD_ID = 'policy-agent-field-id';
const POLICY_NUMBER_UNIQUE_INDEX_ID = 'policy-number-unique-index-id';

const USER_AUTH_CONTEXT = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
  workspaceMemberId: WORKSPACE_MEMBER_ID,
} as UserWorkspaceAuthContext;

const API_KEY_AUTH_CONTEXT = {
  type: 'apiKey',
  workspace: { id: WORKSPACE_ID },
  apiKey: { id: 'api-key-id' },
} as ApiKeyWorkspaceAuthContext;

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
) =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const METADATA_MAPS = {
  flatObjectMetadataMaps: buildFlatEntityMaps([
    getFlatObjectMetadataMock({
      id: POLICY_OBJECT_ID,
      universalIdentifier: POLICY_OBJECT_ID,
      nameSingular: 'policy',
      namePlural: 'policies',
      fieldIds: [
        POLICY_ID_FIELD_ID,
        POLICY_NUMBER_FIELD_ID,
        POLICY_AGENT_FIELD_ID,
      ],
      indexMetadataIds: [POLICY_NUMBER_UNIQUE_INDEX_ID],
    }),
  ]),
  flatFieldMetadataMapsOrm: buildFlatEntityMaps([
    getFlatFieldMetadataMock({
      id: POLICY_ID_FIELD_ID,
      universalIdentifier: POLICY_ID_FIELD_ID,
      objectMetadataId: POLICY_OBJECT_ID,
      type: FieldMetadataType.UUID,
      name: 'id',
    }),
    getFlatFieldMetadataMock({
      id: POLICY_NUMBER_FIELD_ID,
      universalIdentifier: POLICY_NUMBER_FIELD_ID,
      objectMetadataId: POLICY_OBJECT_ID,
      type: FieldMetadataType.TEXT,
      name: 'policyNumber',
      isUnique: true,
    }),
    getFlatFieldMetadataMock({
      id: POLICY_AGENT_FIELD_ID,
      universalIdentifier: POLICY_AGENT_FIELD_ID,
      objectMetadataId: POLICY_OBJECT_ID,
      type: FieldMetadataType.RELATION,
      name: 'agent',
      relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'agentId',
      },
    }),
  ]),
  flatIndexMaps: buildFlatEntityMaps([
    getFlatIndexMetadataMock({
      id: POLICY_NUMBER_UNIQUE_INDEX_ID,
      universalIdentifier: POLICY_NUMBER_UNIQUE_INDEX_ID,
      objectMetadataId: POLICY_OBJECT_ID,
      objectMetadataUniversalIdentifier: POLICY_OBJECT_ID,
      applicationUniversalIdentifier: 'application-id',
      isUnique: true,
      flatIndexFieldMetadatas: [
        {
          id: `${POLICY_NUMBER_UNIQUE_INDEX_ID}-field`,
          workspaceId: WORKSPACE_ID,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          indexMetadataId: POLICY_NUMBER_UNIQUE_INDEX_ID,
          fieldMetadataId: POLICY_NUMBER_FIELD_ID,
          subFieldName: null,
          order: 0,
        },
      ],
    }),
  ]),
};

describe('AgentProfileAssignmentService', () => {
  let service: AgentProfileAssignmentService;
  let resolveAgentProfileId: jest.Mock;
  let getOrRecompute: jest.Mock;
  let executeInWorkspaceContext: jest.Mock;
  let getRepositoryWithoutPermissionChecks: jest.Mock;
  let find: jest.Mock;

  beforeEach(async () => {
    resolveAgentProfileId = jest.fn().mockResolvedValue(MY_AGENT_PROFILE_ID);
    getOrRecompute = jest.fn().mockResolvedValue(METADATA_MAPS);
    find = jest.fn().mockResolvedValue([]);
    getRepositoryWithoutPermissionChecks = jest.fn().mockReturnValue({ find });
    executeInWorkspaceContext = jest.fn((callback) => callback());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentProfileAssignmentService,
        {
          provide: AgentProfileResolverService,
          useValue: { resolveAgentProfileId },
        },
        { provide: WorkspaceCacheService, useValue: { getOrRecompute } },
        {
          provide: WorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext,
            getRepositoryWithoutPermissionChecks,
          },
        },
      ],
    }).compile();

    service = module.get(AgentProfileAssignmentService);
  });

  const assign = ({
    authContext = USER_AUTH_CONTEXT,
    records,
    isUpsert = false,
  }: {
    authContext?: WorkspaceAuthContext;
    records: Record<string, unknown>[];
    isUpsert?: boolean;
  }) =>
    service.assignAgentProfileToNewRecords({
      authContext,
      objectNameSingular: 'policy',
      agentFieldName: 'agentId',
      records,
      isUpsert,
    });

  it('stamps the caller profile on new rows and leaves rows that already carry an agent', async () => {
    const records: Record<string, unknown>[] = [
      { policyNumber: 'P-1' },
      { policyNumber: 'P-2', agentId: OTHER_AGENT_PROFILE_ID },
      { policyNumber: 'P-3', agentId: null },
    ];

    await assign({ records });

    expect(records).toEqual([
      { policyNumber: 'P-1', agentId: MY_AGENT_PROFILE_ID },
      { policyNumber: 'P-2', agentId: OTHER_AGENT_PROFILE_ID },
      { policyNumber: 'P-3', agentId: MY_AGENT_PROFILE_ID },
    ]);
    expect(resolveAgentProfileId).toHaveBeenCalledTimes(1);
    expect(resolveAgentProfileId).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });
    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    ['API key', API_KEY_AUTH_CONTEXT],
    ['system', buildSystemAuthContext(WORKSPACE_ID)],
  ])('leaves rows untouched for a %s context', async (_label, authContext) => {
    const records: Record<string, unknown>[] = [{ policyNumber: 'P-1' }];

    await assign({ authContext, records, isUpsert: true });

    expect(records).toEqual([{ policyNumber: 'P-1' }]);
    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(resolveAgentProfileId).not.toHaveBeenCalled();
  });

  it('keeps the owner of an upserted row that matches an existing record by id', async () => {
    find.mockResolvedValue([{ id: EXISTING_POLICY_ID }]);

    const records: Record<string, unknown>[] = [
      { id: EXISTING_POLICY_ID, status: 'ACTIVE' },
      { id: NEW_POLICY_ID, status: 'ACTIVE' },
    ];

    await assign({ records, isUpsert: true });

    expect(records).toEqual([
      { id: EXISTING_POLICY_ID, status: 'ACTIVE' },
      { id: NEW_POLICY_ID, status: 'ACTIVE', agentId: MY_AGENT_PROFILE_ID },
    ]);
    expect(getRepositoryWithoutPermissionChecks).toHaveBeenCalledWith('policy');
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith({
      where: [{ id: In([EXISTING_POLICY_ID, NEW_POLICY_ID]) }],
      select: ['id', 'policyNumber'],
      withDeleted: true,
    });
    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ type: 'system' }),
    );
  });

  it('keeps the owner of an upserted row that matches an existing record by a unique field', async () => {
    find.mockResolvedValue([
      { id: EXISTING_POLICY_ID, policyNumber: 'P-EXISTING' },
    ]);

    const records: Record<string, unknown>[] = [
      { policyNumber: 'P-EXISTING' },
      { policyNumber: 'P-NEW' },
    ];

    await assign({ records, isUpsert: true });

    expect(records).toEqual([
      { policyNumber: 'P-EXISTING' },
      { policyNumber: 'P-NEW', agentId: MY_AGENT_PROFILE_ID },
    ]);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [{ policyNumber: In(['P-EXISTING', 'P-NEW']) }],
      }),
    );
  });

  it('does not resolve the profile when every upserted row matches an existing record', async () => {
    find.mockResolvedValue([{ id: EXISTING_POLICY_ID }]);

    const records: Record<string, unknown>[] = [{ id: EXISTING_POLICY_ID }];

    await assign({ records, isUpsert: true });

    expect(records).toEqual([{ id: EXISTING_POLICY_ID }]);
    expect(resolveAgentProfileId).not.toHaveBeenCalled();
  });

  it('stamps upserted rows without a lookup when nothing can match them', async () => {
    const records: Record<string, unknown>[] = [{ status: 'ACTIVE' }];

    await assign({ records, isUpsert: true });

    expect(records).toEqual([
      { status: 'ACTIVE', agentId: MY_AGENT_PROFILE_ID },
    ]);
    expect(find).not.toHaveBeenCalled();
  });

  it('leaves rows whose agent comes from a nested relation operation', async () => {
    const records: Record<string, unknown>[] = [
      {
        policyNumber: 'P-1',
        agent: { connect: { where: { id: OTHER_AGENT_PROFILE_ID } } },
      },
    ];

    await assign({ records });

    expect(records).toEqual([
      {
        policyNumber: 'P-1',
        agent: { connect: { where: { id: OTHER_AGENT_PROFILE_ID } } },
      },
    ]);
    expect(resolveAgentProfileId).not.toHaveBeenCalled();
  });

  it('skips every lookup when all rows already carry an agent', async () => {
    const records: Record<string, unknown>[] = [
      { agentId: OTHER_AGENT_PROFILE_ID },
    ];

    await assign({ records, isUpsert: true });

    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(resolveAgentProfileId).not.toHaveBeenCalled();
  });

  it('leaves rows untouched when the caller has no agent profile', async () => {
    resolveAgentProfileId.mockResolvedValue(null);

    const records: Record<string, unknown>[] = [{ policyNumber: 'P-1' }];

    await assign({ records });

    expect(records).toEqual([{ policyNumber: 'P-1' }]);
  });
});
