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
import { PersonCreateManyPreQueryHook } from 'src/modules/lead/query-hooks/person-create-many.pre-query.hook';
import { PersonCreateOnePreQueryHook } from 'src/modules/lead/query-hooks/person-create-one.pre-query.hook';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const MY_AGENT_PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_AGENT_PROFILE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXISTING_LEAD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EXISTING_LEAD_EMAIL = 'existing.lead@example.com';
const NEW_LEAD_EMAIL = 'new.lead@example.com';

const PERSON_OBJECT_ID = 'person-object-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const PERSON_ID_FIELD_ID = 'person-id-field-id';
const PERSON_EMAILS_FIELD_ID = 'person-emails-field-id';
const PERSON_ASSIGNED_AGENT_FIELD_ID = 'person-assigned-agent-field-id';
const PERSON_EMAILS_UNIQUE_INDEX_ID = 'person-emails-unique-index-id';

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
      id: PERSON_OBJECT_ID,
      universalIdentifier: PERSON_OBJECT_ID,
      nameSingular: 'person',
      namePlural: 'people',
      fieldIds: [
        PERSON_ID_FIELD_ID,
        PERSON_EMAILS_FIELD_ID,
        PERSON_ASSIGNED_AGENT_FIELD_ID,
      ],
      indexMetadataIds: [PERSON_EMAILS_UNIQUE_INDEX_ID],
    }),
  ]),
  flatFieldMetadataMapsOrm: buildFlatEntityMaps([
    getFlatFieldMetadataMock({
      id: PERSON_ID_FIELD_ID,
      universalIdentifier: PERSON_ID_FIELD_ID,
      objectMetadataId: PERSON_OBJECT_ID,
      type: FieldMetadataType.UUID,
      name: 'id',
    }),
    getFlatFieldMetadataMock({
      id: PERSON_EMAILS_FIELD_ID,
      universalIdentifier: PERSON_EMAILS_FIELD_ID,
      objectMetadataId: PERSON_OBJECT_ID,
      type: FieldMetadataType.EMAILS,
      name: 'emails',
      isUnique: true,
    }),
    getFlatFieldMetadataMock({
      id: PERSON_ASSIGNED_AGENT_FIELD_ID,
      universalIdentifier: PERSON_ASSIGNED_AGENT_FIELD_ID,
      objectMetadataId: PERSON_OBJECT_ID,
      type: FieldMetadataType.RELATION,
      name: 'assignedAgent',
      relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'assignedAgentId',
      },
    }),
  ]),
  flatIndexMaps: buildFlatEntityMaps([
    getFlatIndexMetadataMock({
      id: PERSON_EMAILS_UNIQUE_INDEX_ID,
      universalIdentifier: PERSON_EMAILS_UNIQUE_INDEX_ID,
      objectMetadataId: PERSON_OBJECT_ID,
      objectMetadataUniversalIdentifier: PERSON_OBJECT_ID,
      applicationUniversalIdentifier: 'application-id',
      isUnique: true,
      flatIndexFieldMetadatas: [
        {
          id: `${PERSON_EMAILS_UNIQUE_INDEX_ID}-field`,
          workspaceId: WORKSPACE_ID,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          indexMetadataId: PERSON_EMAILS_UNIQUE_INDEX_ID,
          fieldMetadataId: PERSON_EMAILS_FIELD_ID,
          subFieldName: null,
          order: 0,
        },
      ],
    }),
  ]),
};

describe('Person (lead) create pre-query hooks', () => {
  let createOneHook: PersonCreateOnePreQueryHook;
  let createManyHook: PersonCreateManyPreQueryHook;
  let resolveAgentProfileId: jest.Mock;
  let find: jest.Mock;

  beforeEach(async () => {
    resolveAgentProfileId = jest.fn().mockResolvedValue(MY_AGENT_PROFILE_ID);
    find = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonCreateOnePreQueryHook,
        PersonCreateManyPreQueryHook,
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

    createOneHook = module.get(PersonCreateOnePreQueryHook);
    createManyHook = module.get(PersonCreateManyPreQueryHook);
  });

  describe('createMany', () => {
    const createLeads = (
      data: Record<string, unknown>[],
      {
        authContext = USER_AUTH_CONTEXT,
        upsert,
      }: { authContext?: WorkspaceAuthContext; upsert?: boolean } = {},
    ) => createManyHook.execute(authContext, 'person', { data, upsert });

    it("assigns the caller's agent profile to new leads", async () => {
      const result = await createLeads([
        { emails: { primaryEmail: NEW_LEAD_EMAIL } },
      ]);

      expect(result.data).toEqual([
        {
          emails: { primaryEmail: NEW_LEAD_EMAIL },
          assignedAgentId: MY_AGENT_PROFILE_ID,
        },
      ]);
      expect(resolveAgentProfileId).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        workspaceMemberId: WORKSPACE_MEMBER_ID,
      });
    });

    it('leaves leads that already have an assigned agent untouched', async () => {
      const assignedAgentConnect = {
        connect: { where: { id: OTHER_AGENT_PROFILE_ID } },
      };

      const result = await createLeads([
        { city: 'Austin', assignedAgentId: OTHER_AGENT_PROFILE_ID },
        { city: 'Dallas', assignedAgent: assignedAgentConnect },
        { city: 'Houston' },
      ]);

      expect(result.data).toEqual([
        { city: 'Austin', assignedAgentId: OTHER_AGENT_PROFILE_ID },
        { city: 'Dallas', assignedAgent: assignedAgentConnect },
        { city: 'Houston', assignedAgentId: MY_AGENT_PROFILE_ID },
      ]);
    });

    it.each([
      ['API key', API_KEY_AUTH_CONTEXT],
      ['system', buildSystemAuthContext(WORKSPACE_ID)],
    ])(
      'does not assign an agent for a %s context',
      async (_label, authContext) => {
        const result = await createLeads([{ city: 'Austin' }], {
          authContext,
          upsert: true,
        });

        expect(result.data).toEqual([{ city: 'Austin' }]);
        expect(resolveAgentProfileId).not.toHaveBeenCalled();
      },
    );

    it('keeps the assigned agent of an existing lead matched by primary email during an upsert', async () => {
      find.mockResolvedValue([
        { id: EXISTING_LEAD_ID, emails: { primaryEmail: EXISTING_LEAD_EMAIL } },
      ]);

      const result = await createLeads(
        [
          { emails: { primaryEmail: EXISTING_LEAD_EMAIL }, city: 'Austin' },
          { emails: { primaryEmail: NEW_LEAD_EMAIL }, city: 'Dallas' },
        ],
        { upsert: true },
      );

      expect(result.data).toEqual([
        { emails: { primaryEmail: EXISTING_LEAD_EMAIL }, city: 'Austin' },
        {
          emails: { primaryEmail: NEW_LEAD_EMAIL },
          city: 'Dallas',
          assignedAgentId: MY_AGENT_PROFILE_ID,
        },
      ]);
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [
            { emailsPrimaryEmail: In([EXISTING_LEAD_EMAIL, NEW_LEAD_EMAIL]) },
          ],
        }),
      );
    });
  });

  describe('createOne', () => {
    it("assigns the caller's agent profile to a new lead", async () => {
      const result = await createOneHook.execute(USER_AUTH_CONTEXT, 'person', {
        data: { city: 'Austin' },
      });

      expect(result.data).toEqual({
        city: 'Austin',
        assignedAgentId: MY_AGENT_PROFILE_ID,
      });
    });

    it('leaves a lead that already has an assigned agent untouched', async () => {
      const result = await createOneHook.execute(USER_AUTH_CONTEXT, 'person', {
        data: { city: 'Austin', assignedAgentId: OTHER_AGENT_PROFILE_ID },
      });

      expect(result.data).toEqual({
        city: 'Austin',
        assignedAgentId: OTHER_AGENT_PROFILE_ID,
      });
      expect(resolveAgentProfileId).not.toHaveBeenCalled();
    });

    it('keeps the assigned agent of an existing lead matched by id during an upsert', async () => {
      find.mockResolvedValue([{ id: EXISTING_LEAD_ID }]);

      const result = await createOneHook.execute(USER_AUTH_CONTEXT, 'person', {
        data: { id: EXISTING_LEAD_ID, city: 'Austin' },
        upsert: true,
      });

      expect(result.data).toEqual({ id: EXISTING_LEAD_ID, city: 'Austin' });
      expect(resolveAgentProfileId).not.toHaveBeenCalled();
    });

    it('does not assign an agent for an API key context', async () => {
      const result = await createOneHook.execute(
        API_KEY_AUTH_CONTEXT,
        'person',
        { data: { city: 'Austin' } },
      );

      expect(result.data).toEqual({ city: 'Austin' });
    });
  });
});
