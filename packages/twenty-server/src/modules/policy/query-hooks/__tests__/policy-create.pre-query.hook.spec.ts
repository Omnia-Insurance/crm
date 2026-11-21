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
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { AgentProfileAssignmentService } from 'src/modules/agent-profile/services/agent-profile-assignment.service';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';
import { PolicyCreateManyPreQueryHook } from 'src/modules/policy/query-hooks/policy-create-many.pre-query.hook';
import { PolicyCreateOnePreQueryHook } from 'src/modules/policy/query-hooks/policy-create-one.pre-query.hook';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';
import { getNowUtc } from 'src/modules/policy/utils/get-today-for-member.util';

jest.mock('src/modules/policy/utils/get-today-for-member.util', () => ({
  getNowUtc: jest.fn(),
}));

const SUBMITTED_DATE = '2026-11-18T12:00:00.000Z';
const STORED_SUBMITTED_DATE = '2026-01-05T15:00:00.000Z';
const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const MY_AGENT_PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_AGENT_PROFILE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXISTING_POLICY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NEW_POLICY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const AMBETTER_CARRIER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OSCAR_CARRIER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const GOLD_PRODUCT_ID = '12121212-1212-4121-8121-121212121212';

const POLICY_OBJECT_ID = 'policy-object-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const POLICY_ID_FIELD_ID = 'policy-id-field-id';
const POLICY_AGENT_FIELD_ID = 'policy-agent-field-id';

const NAMED_RECORDS_BY_OBJECT: Record<string, { id: string; name: string }[]> =
  {
    carrier: [
      { id: AMBETTER_CARRIER_ID, name: ' Ambetter ' },
      { id: OSCAR_CARRIER_ID, name: 'Oscar' },
    ],
    product: [{ id: GOLD_PRODUCT_ID, name: 'Gold' }],
  };

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
      fieldIds: [POLICY_ID_FIELD_ID, POLICY_AGENT_FIELD_ID],
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
  flatIndexMaps: createEmptyFlatEntityMaps(),
};

describe('Policy create pre-query hooks', () => {
  let createOneHook: PolicyCreateOnePreQueryHook;
  let createManyHook: PolicyCreateManyPreQueryHook;
  let resolveAgentProfileId: jest.Mock;
  let findExistingPolicies: jest.Mock;
  let findNamedRecords: jest.Mock;
  let executeInWorkspaceContext: jest.Mock;
  let assertUserMayUpsertPolicies: jest.Mock;

  beforeEach(async () => {
    jest.mocked(getNowUtc).mockReturnValue(SUBMITTED_DATE);
    assertUserMayUpsertPolicies = jest.fn().mockResolvedValue(undefined);
    resolveAgentProfileId = jest.fn().mockResolvedValue(MY_AGENT_PROFILE_ID);
    findExistingPolicies = jest.fn().mockResolvedValue([]);
    findNamedRecords = jest.fn(
      async (
        objectNameSingular: string,
        { where }: { where: { id: { value: string[] } } },
      ) =>
        (NAMED_RECORDS_BY_OBJECT[objectNameSingular] ?? []).filter(({ id }) =>
          where.id.value.includes(id),
        ),
    );
    executeInWorkspaceContext = jest.fn((callback: () => unknown) =>
      callback(),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyCreateOnePreQueryHook,
        PolicyCreateManyPreQueryHook,
        AgentProfileAssignmentService,
        {
          provide: PolicyWriteAuthorizationService,
          useValue: { assertUserMayUpsertPolicies },
        },
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
            executeInWorkspaceContext,
            getRepositoryWithoutPermissionChecks: jest.fn(
              (objectNameSingular: string) => ({
                find:
                  objectNameSingular === 'policy'
                    ? findExistingPolicies
                    : (options: { where: { id: { value: string[] } } }) =>
                        findNamedRecords(objectNameSingular, options),
              }),
            ),
          },
        },
      ],
    }).compile();

    createOneHook = module.get(PolicyCreateOnePreQueryHook);
    createManyHook = module.get(PolicyCreateManyPreQueryHook);
  });

  describe('createOne', () => {
    const createPolicy = (
      data: Record<string, unknown>,
      {
        authContext = USER_AUTH_CONTEXT,
        upsert,
      }: { authContext?: WorkspaceAuthContext; upsert?: boolean } = {},
    ) => createOneHook.execute(authContext, 'policy', { data, upsert });

    it("assigns the caller's agent profile, dates the policy and derives the name", async () => {
      const result = await createPolicy({
        carrierId: AMBETTER_CARRIER_ID,
        productId: GOLD_PRODUCT_ID,
      });

      expect(result.data).toEqual({
        carrierId: AMBETTER_CARRIER_ID,
        productId: GOLD_PRODUCT_ID,
        agentId: MY_AGENT_PROFILE_ID,
        submittedDate: SUBMITTED_DATE,
        name: 'Ambetter - Gold',
      });
      expect(resolveAgentProfileId).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        workspaceMemberId: WORKSPACE_MEMBER_ID,
      });
      expect(executeInWorkspaceContext).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ type: 'system' }),
        { lite: true },
      );
    });

    it('keeps an agent and a submission date the caller already chose', async () => {
      const result = await createPolicy({
        agentId: OTHER_AGENT_PROFILE_ID,
        submittedDate: STORED_SUBMITTED_DATE,
      });

      expect(result.data).toEqual({
        agentId: OTHER_AGENT_PROFILE_ID,
        submittedDate: STORED_SUBMITTED_DATE,
      });
      expect(resolveAgentProfileId).not.toHaveBeenCalled();
    });

    it('does not assign an agent or a submission date for an API key context but still derives the name', async () => {
      const result = await createPolicy(
        { carrierId: OSCAR_CARRIER_ID },
        { authContext: API_KEY_AUTH_CONTEXT },
      );

      expect(result.data).toEqual({
        carrierId: OSCAR_CARRIER_ID,
        name: 'Oscar - Unknown',
      });
      expect(resolveAgentProfileId).not.toHaveBeenCalled();
    });

    it('keeps the owner of an existing policy matched during an upsert', async () => {
      findExistingPolicies.mockResolvedValue([{ id: EXISTING_POLICY_ID }]);

      const result = await createPolicy(
        { id: EXISTING_POLICY_ID, status: 'ACTIVE' },
        { upsert: true },
      );

      expect(result.data).toEqual({ id: EXISTING_POLICY_ID, status: 'ACTIVE' });
      expect(resolveAgentProfileId).not.toHaveBeenCalled();
      expect(assertUserMayUpsertPolicies).toHaveBeenCalledWith({
        authContext: USER_AUTH_CONTEXT,
        records: [{ id: EXISTING_POLICY_ID, status: 'ACTIVE' }],
      });
    });

    it('dates a policy that an upsert inserts', async () => {
      const result = await createPolicy(
        { id: NEW_POLICY_ID, status: 'ACTIVE' },
        { upsert: true },
      );

      expect(result.data).toEqual({
        id: NEW_POLICY_ID,
        status: 'ACTIVE',
        agentId: MY_AGENT_PROFILE_ID,
        submittedDate: SUBMITTED_DATE,
      });
    });

    it('refuses an upsert the edit window or row-level security denies before stamping anything', async () => {
      assertUserMayUpsertPolicies.mockRejectedValue(
        new Error('edit window denied'),
      );

      await expect(
        createPolicy({ id: EXISTING_POLICY_ID }, { upsert: true }),
      ).rejects.toThrow('edit window denied');
      expect(resolveAgentProfileId).not.toHaveBeenCalled();
    });

    it('checks no edit window for a plain create', async () => {
      await createPolicy({ status: 'ACTIVE' });

      expect(assertUserMayUpsertPolicies).not.toHaveBeenCalled();
    });

    it('leaves the name alone without a carrier or product', async () => {
      const result = await createPolicy({ name: 'Custom name' });

      expect(result.data).toEqual({
        name: 'Custom name',
        agentId: MY_AGENT_PROFILE_ID,
        submittedDate: SUBMITTED_DATE,
      });
      expect(findNamedRecords).not.toHaveBeenCalled();
    });
  });

  describe('createMany', () => {
    const createPolicies = (
      data: Record<string, unknown>[],
      {
        authContext = USER_AUTH_CONTEXT,
        upsert,
      }: { authContext?: WorkspaceAuthContext; upsert?: boolean } = {},
    ) => createManyHook.execute(authContext, 'policy', { data, upsert });

    it('assigns the caller and names every policy with one carrier and one product lookup', async () => {
      const result = await createPolicies([
        { carrierId: AMBETTER_CARRIER_ID, productId: GOLD_PRODUCT_ID },
        { carrierId: OSCAR_CARRIER_ID, productId: GOLD_PRODUCT_ID },
        { carrierId: AMBETTER_CARRIER_ID },
        { status: 'ACTIVE' },
      ]);

      expect(result.data).toEqual([
        {
          carrierId: AMBETTER_CARRIER_ID,
          productId: GOLD_PRODUCT_ID,
          agentId: MY_AGENT_PROFILE_ID,
          submittedDate: SUBMITTED_DATE,
          name: 'Ambetter - Gold',
        },
        {
          carrierId: OSCAR_CARRIER_ID,
          productId: GOLD_PRODUCT_ID,
          agentId: MY_AGENT_PROFILE_ID,
          submittedDate: SUBMITTED_DATE,
          name: 'Oscar - Gold',
        },
        {
          carrierId: AMBETTER_CARRIER_ID,
          agentId: MY_AGENT_PROFILE_ID,
          submittedDate: SUBMITTED_DATE,
          name: 'Ambetter - Unknown',
        },
        {
          status: 'ACTIVE',
          agentId: MY_AGENT_PROFILE_ID,
          submittedDate: SUBMITTED_DATE,
        },
      ]);
      expect(findNamedRecords).toHaveBeenCalledTimes(2);
      expect(findNamedRecords).toHaveBeenCalledWith('carrier', {
        where: { id: In([AMBETTER_CARRIER_ID, OSCAR_CARRIER_ID]) },
        select: ['id', 'name'],
      });
      expect(findNamedRecords).toHaveBeenCalledWith('product', {
        where: { id: In([GOLD_PRODUCT_ID]) },
        select: ['id', 'name'],
      });
    });

    it('keeps the owner of an existing policy matched during an upsert', async () => {
      findExistingPolicies.mockResolvedValue([{ id: EXISTING_POLICY_ID }]);

      const result = await createPolicies(
        [
          { id: EXISTING_POLICY_ID, status: 'ACTIVE' },
          { id: NEW_POLICY_ID, status: 'ACTIVE' },
        ],
        { upsert: true },
      );

      expect(result.data).toEqual([
        { id: EXISTING_POLICY_ID, status: 'ACTIVE' },
        {
          id: NEW_POLICY_ID,
          status: 'ACTIVE',
          agentId: MY_AGENT_PROFILE_ID,
          submittedDate: SUBMITTED_DATE,
        },
      ]);
      expect(assertUserMayUpsertPolicies).toHaveBeenCalledWith({
        authContext: USER_AUTH_CONTEXT,
        records: result.data,
      });
    });

    // A re-import must not count stored policies as today's sales (agent rollups read submittedDate)
    it('dates only the undated policies an upsert inserts', async () => {
      findExistingPolicies.mockResolvedValue([{ id: EXISTING_POLICY_ID }]);

      const result = await createPolicies(
        [
          { id: EXISTING_POLICY_ID, agentId: OTHER_AGENT_PROFILE_ID },
          { id: NEW_POLICY_ID, agentId: OTHER_AGENT_PROFILE_ID },
          {
            agentId: OTHER_AGENT_PROFILE_ID,
            submittedDate: STORED_SUBMITTED_DATE,
          },
        ],
        { upsert: true },
      );

      expect(result.data).toEqual([
        { id: EXISTING_POLICY_ID, agentId: OTHER_AGENT_PROFILE_ID },
        {
          id: NEW_POLICY_ID,
          agentId: OTHER_AGENT_PROFILE_ID,
          submittedDate: SUBMITTED_DATE,
        },
        {
          agentId: OTHER_AGENT_PROFILE_ID,
          submittedDate: STORED_SUBMITTED_DATE,
        },
      ]);
      expect(findExistingPolicies).toHaveBeenCalledTimes(1);
      expect(findExistingPolicies).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    });

    it('dates every undated policy of a plain create without looking up stored ones', async () => {
      const result = await createPolicies([
        { id: EXISTING_POLICY_ID, agentId: OTHER_AGENT_PROFILE_ID },
      ]);

      expect(result.data).toEqual([
        {
          id: EXISTING_POLICY_ID,
          agentId: OTHER_AGENT_PROFILE_ID,
          submittedDate: SUBMITTED_DATE,
        },
      ]);
      expect(findExistingPolicies).not.toHaveBeenCalled();
    });

    it('does not assign an agent for an API key context', async () => {
      const result = await createPolicies([{ status: 'ACTIVE' }], {
        authContext: API_KEY_AUTH_CONTEXT,
        upsert: true,
      });

      expect(result.data).toEqual([{ status: 'ACTIVE' }]);
      expect(resolveAgentProfileId).not.toHaveBeenCalled();
      expect(executeInWorkspaceContext).not.toHaveBeenCalled();
    });
  });
});
