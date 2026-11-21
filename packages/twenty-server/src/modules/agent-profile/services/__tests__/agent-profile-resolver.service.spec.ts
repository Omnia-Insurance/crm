import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const WORKSPACE_MEMBER_OBJECT_ID = 'workspace-member-object-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const AGENT_PROFILE_NAME_FIELD_ID = 'agent-profile-name-field-id';
const AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID =
  'agent-profile-workspace-member-field-id';
const AGENT_PROFILE_MANAGED_MEMBERS_FIELD_ID =
  'agent-profile-managed-members-field-id';
const AGENT_PROFILE_MANAGER_FIELD_ID = 'agent-profile-manager-field-id';

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
) =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const buildWorkspaceMemberRelationField = ({
  id,
  name,
  relationType,
  joinColumnName,
}: {
  id: string;
  name: string;
  relationType: RelationType;
  joinColumnName?: string;
}): FlatFieldMetadata =>
  getFlatFieldMetadataMock({
    id,
    universalIdentifier: id,
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name,
    relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    settings: { relationType, joinColumnName },
  });

const buildMetadataMaps = ({
  agentProfileObjectNameSingular = 'agentProfile',
  isAgentProfileObjectActive = true,
  agentProfileFields = [
    getFlatFieldMetadataMock({
      id: AGENT_PROFILE_NAME_FIELD_ID,
      universalIdentifier: AGENT_PROFILE_NAME_FIELD_ID,
      objectMetadataId: AGENT_PROFILE_OBJECT_ID,
      type: FieldMetadataType.TEXT,
      name: 'name',
    }),
    buildWorkspaceMemberRelationField({
      id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
      name: 'workspaceMember',
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName: 'workspaceMemberId',
    }),
  ],
}: {
  agentProfileObjectNameSingular?: string;
  isAgentProfileObjectActive?: boolean;
  agentProfileFields?: FlatFieldMetadata[];
} = {}) => ({
  flatObjectMetadataMaps: buildFlatEntityMaps([
    getFlatObjectMetadataMock({
      id: WORKSPACE_MEMBER_OBJECT_ID,
      universalIdentifier: WORKSPACE_MEMBER_OBJECT_ID,
      nameSingular: 'workspaceMember',
      namePlural: 'workspaceMembers',
    }),
    getFlatObjectMetadataMock({
      id: AGENT_PROFILE_OBJECT_ID,
      universalIdentifier: AGENT_PROFILE_OBJECT_ID,
      nameSingular: agentProfileObjectNameSingular,
      namePlural: `${agentProfileObjectNameSingular}s`,
      isActive: isAgentProfileObjectActive,
      fieldIds: agentProfileFields.map(({ id }) => id),
    }),
  ]),
  flatFieldMetadataMaps: buildFlatEntityMaps(agentProfileFields),
});

describe('AgentProfileResolverService', () => {
  let service: AgentProfileResolverService;
  let getOrRecompute: jest.Mock;
  let executeInWorkspaceContext: jest.Mock;
  let getRepositoryWithoutPermissionChecks: jest.Mock;
  let findOne: jest.Mock;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    getOrRecompute = jest.fn().mockResolvedValue(buildMetadataMaps());
    findOne = jest.fn().mockResolvedValue({ id: AGENT_PROFILE_ID });
    getRepositoryWithoutPermissionChecks = jest
      .fn()
      .mockReturnValue({ findOne });
    executeInWorkspaceContext = jest.fn((callback) => callback());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentProfileResolverService,
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

    service = module.get(AgentProfileResolverService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('finds the profile through the workspace member relation join column in a system context', async () => {
    const agentProfileId = await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(agentProfileId).toBe(AGENT_PROFILE_ID);
    expect(getOrRecompute).toHaveBeenCalledWith(WORKSPACE_ID, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
    ]);
    expect(getRepositoryWithoutPermissionChecks).toHaveBeenCalledWith(
      'agentProfile',
    );
    expect(findOne).toHaveBeenCalledWith({
      where: { workspaceMemberId: WORKSPACE_MEMBER_ID },
      select: ['id'],
    });
    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        type: 'system',
        workspace: expect.objectContaining({ id: WORKSPACE_ID }),
      }),
    );
  });

  it('uses the join column from the relation settings', async () => {
    getOrRecompute.mockResolvedValue(
      buildMetadataMaps({
        agentProfileFields: [
          buildWorkspaceMemberRelationField({
            id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
            name: 'member',
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'linkedMemberId',
          }),
        ],
      }),
    );

    await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(findOne).toHaveBeenCalledWith({
      where: { linkedMemberId: WORKSPACE_MEMBER_ID },
      select: ['id'],
    });
  });

  it('ignores one-to-many relations to workspace members', async () => {
    getOrRecompute.mockResolvedValue(
      buildMetadataMaps({
        agentProfileFields: [
          buildWorkspaceMemberRelationField({
            id: AGENT_PROFILE_MANAGED_MEMBERS_FIELD_ID,
            name: 'managedMembers',
            relationType: RelationType.ONE_TO_MANY,
          }),
          buildWorkspaceMemberRelationField({
            id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
            name: 'workspaceMember',
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'workspaceMemberId',
          }),
        ],
      }),
    );

    await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(findOne).toHaveBeenCalledWith({
      where: { workspaceMemberId: WORKSPACE_MEMBER_ID },
      select: ['id'],
    });
  });

  it('reads the workspaceMember relation, not manager, when both target workspace members', async () => {
    getOrRecompute.mockResolvedValue(
      buildMetadataMaps({
        agentProfileFields: [
          buildWorkspaceMemberRelationField({
            id: AGENT_PROFILE_MANAGER_FIELD_ID,
            name: 'manager',
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'managerId',
          }),
          buildWorkspaceMemberRelationField({
            id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
            name: 'workspaceMember',
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'workspaceMemberId',
          }),
        ],
      }),
    );

    await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(findOne).toHaveBeenCalledWith({
      where: { workspaceMemberId: WORKSPACE_MEMBER_ID },
      select: ['id'],
    });
  });

  it('returns null without querying when several relations target workspace members and none is workspaceMember', async () => {
    getOrRecompute.mockResolvedValue(
      buildMetadataMaps({
        agentProfileFields: [
          buildWorkspaceMemberRelationField({
            id: AGENT_PROFILE_MANAGER_FIELD_ID,
            name: 'manager',
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'managerId',
          }),
          buildWorkspaceMemberRelationField({
            id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
            name: 'member',
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'memberId',
          }),
        ],
      }),
    );

    const agentProfileId = await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(agentProfileId).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('falls back to the agent object when there is no agentProfile object', async () => {
    getOrRecompute.mockResolvedValue(
      buildMetadataMaps({ agentProfileObjectNameSingular: 'agent' }),
    );

    await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(getRepositoryWithoutPermissionChecks).toHaveBeenCalledWith('agent');
  });

  it('returns null without querying when the agent profile object is inactive', async () => {
    getOrRecompute.mockResolvedValue(
      buildMetadataMaps({ isAgentProfileObjectActive: false }),
    );

    const agentProfileId = await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(agentProfileId).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('returns null without querying when no relation targets workspace members', async () => {
    getOrRecompute.mockResolvedValue(
      buildMetadataMaps({
        agentProfileFields: [
          getFlatFieldMetadataMock({
            id: AGENT_PROFILE_NAME_FIELD_ID,
            universalIdentifier: AGENT_PROFILE_NAME_FIELD_ID,
            objectMetadataId: AGENT_PROFILE_OBJECT_ID,
            type: FieldMetadataType.TEXT,
            name: 'name',
          }),
        ],
      }),
    );

    const agentProfileId = await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(agentProfileId).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('returns null when the workspace member has no profile', async () => {
    findOne.mockResolvedValue(null);

    const agentProfileId = await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(agentProfileId).toBeNull();
  });

  it('returns null when the lookup fails', async () => {
    findOne.mockRejectedValue(new Error('connection reset'));

    const agentProfileId = await service.resolveAgentProfileId({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    expect(agentProfileId).toBeNull();
  });
});
