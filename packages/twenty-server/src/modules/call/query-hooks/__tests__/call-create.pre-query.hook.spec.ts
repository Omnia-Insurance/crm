import { Test, type TestingModule } from '@nestjs/testing';

import { FieldMetadataType, RelationType } from 'twenty-shared/types';

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
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { AgentProfileAssignmentService } from 'src/modules/agent-profile/services/agent-profile-assignment.service';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';
import { CallCreateManyPreQueryHook } from 'src/modules/call/query-hooks/call-create-many.pre-query.hook';
import { CallCreateOnePreQueryHook } from 'src/modules/call/query-hooks/call-create-one.pre-query.hook';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const MY_AGENT_PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_AGENT_PROFILE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXISTING_CALL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NEW_CALL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const CALL_OBJECT_ID = 'call-object-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const CALL_ID_FIELD_ID = 'call-id-field-id';
const CALL_AGENT_FIELD_ID = 'call-agent-field-id';

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
      id: CALL_OBJECT_ID,
      universalIdentifier: CALL_OBJECT_ID,
      nameSingular: 'call',
      namePlural: 'calls',
      fieldIds: [CALL_ID_FIELD_ID, CALL_AGENT_FIELD_ID],
    }),
  ]),
  flatFieldMetadataMapsOrm: buildFlatEntityMaps([
    getFlatFieldMetadataMock({
      id: CALL_ID_FIELD_ID,
      universalIdentifier: CALL_ID_FIELD_ID,
      objectMetadataId: CALL_OBJECT_ID,
      type: FieldMetadataType.UUID,
      name: 'id',
    }),
    getFlatFieldMetadataMock({
      id: CALL_AGENT_FIELD_ID,
      universalIdentifier: CALL_AGENT_FIELD_ID,
      objectMetadataId: CALL_OBJECT_ID,
      type: FieldMetadataType.RELATION,
      name: 'agent',
      relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'agentId',
      },
    }),
  ]),
  flatIndexMaps: createEmptyFlatEntityMaps(),
};

describe('Call create pre-query hooks', () => {
  let createOneHook: CallCreateOnePreQueryHook;
  let createManyHook: CallCreateManyPreQueryHook;
  let resolveAgentProfileId: jest.Mock;
  let find: jest.Mock;

  beforeEach(async () => {
    resolveAgentProfileId = jest.fn().mockResolvedValue(MY_AGENT_PROFILE_ID);
    find = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallCreateOnePreQueryHook,
        CallCreateManyPreQueryHook,
        AgentProfileAssignmentService,
        {
          provide: AgentProfileResolverService,
          useValue: { resolveAgentProfileId },
        },
        {
          provide: WorkspaceCacheService,
          useValue: {
            getOrRecompute: jest.fn().mockResolvedValue(METADATA_MAPS),
          },
        },
        {
          provide: WorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext: jest.fn((callback) => callback()),
            getRepositoryWithoutPermissionChecks: jest
              .fn()
              .mockReturnValue({ find }),
          },
        },
      ],
    }).compile();

    createOneHook = module.get(CallCreateOnePreQueryHook);
    createManyHook = module.get(CallCreateManyPreQueryHook);
  });

  describe('createMany', () => {
    const createCalls = (
      data: Record<string, unknown>[],
      {
        authContext = USER_AUTH_CONTEXT,
        upsert,
      }: { authContext?: WorkspaceAuthContext; upsert?: boolean } = {},
    ) => createManyHook.execute(authContext, 'call', { data, upsert });

    it("assigns the caller's agent profile to new calls", async () => {
      const result = await createCalls([{ duration: 120 }, { duration: 45 }]);

      expect(result.data).toEqual([
        { duration: 120, agentId: MY_AGENT_PROFILE_ID },
        { duration: 45, agentId: MY_AGENT_PROFILE_ID },
      ]);
      expect(resolveAgentProfileId).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        workspaceMemberId: WORKSPACE_MEMBER_ID,
      });
    });

    it('leaves calls that already carry an agent untouched', async () => {
      const agentConnect = {
        connect: { where: { id: OTHER_AGENT_PROFILE_ID } },
      };

      const result = await createCalls([
        { duration: 120, agentId: OTHER_AGENT_PROFILE_ID },
        { duration: 45, agent: agentConnect },
        { duration: 30 },
      ]);

      expect(result.data).toEqual([
        { duration: 120, agentId: OTHER_AGENT_PROFILE_ID },
        { duration: 45, agent: agentConnect },
        { duration: 30, agentId: MY_AGENT_PROFILE_ID },
      ]);
    });

    it.each([
      ['API key', API_KEY_AUTH_CONTEXT],
      ['system', buildSystemAuthContext(WORKSPACE_ID)],
    ])(
      'does not assign an agent for a %s context',
      async (_label, authContext) => {
        const result = await createCalls([{ duration: 120 }], {
          authContext,
          upsert: true,
        });

        expect(result.data).toEqual([{ duration: 120 }]);
        expect(resolveAgentProfileId).not.toHaveBeenCalled();
      },
    );

    it('keeps the agent of an existing call matched by id during an upsert', async () => {
      find.mockResolvedValue([{ id: EXISTING_CALL_ID }]);

      const result = await createCalls(
        [
          { id: EXISTING_CALL_ID, duration: 120 },
          { id: NEW_CALL_ID, duration: 45 },
        ],
        { upsert: true },
      );

      expect(result.data).toEqual([
        { id: EXISTING_CALL_ID, duration: 120 },
        { id: NEW_CALL_ID, duration: 45, agentId: MY_AGENT_PROFILE_ID },
      ]);
    });
  });

  describe('createOne', () => {
    it("assigns the caller's agent profile to a new call", async () => {
      const result = await createOneHook.execute(USER_AUTH_CONTEXT, 'call', {
        data: { duration: 120 },
      });

      expect(result.data).toEqual({
        duration: 120,
        agentId: MY_AGENT_PROFILE_ID,
      });
    });

    it('leaves a call that already carries an agent untouched', async () => {
      const result = await createOneHook.execute(USER_AUTH_CONTEXT, 'call', {
        data: { duration: 120, agentId: OTHER_AGENT_PROFILE_ID },
      });

      expect(result.data).toEqual({
        duration: 120,
        agentId: OTHER_AGENT_PROFILE_ID,
      });
      expect(resolveAgentProfileId).not.toHaveBeenCalled();
    });

    it('keeps the agent of an existing call during an upsert', async () => {
      find.mockResolvedValue([{ id: EXISTING_CALL_ID }]);

      const result = await createOneHook.execute(USER_AUTH_CONTEXT, 'call', {
        data: { id: EXISTING_CALL_ID, duration: 120 },
        upsert: true,
      });

      expect(result.data).toEqual({ id: EXISTING_CALL_ID, duration: 120 });
      expect(resolveAgentProfileId).not.toHaveBeenCalled();
    });

    it('does not assign an agent for an API key context', async () => {
      const result = await createOneHook.execute(API_KEY_AUTH_CONTEXT, 'call', {
        data: { duration: 120 },
      });

      expect(result.data).toEqual({ duration: 120 });
    });
  });
});
