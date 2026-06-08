import { RowLevelPermissionPredicateScope } from 'twenty-shared/types';

import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { PolicyUpdateManyPreQueryHook } from 'src/modules/policy/query-hooks/policy-update-many.pre-query.hook';
import { PolicyUpdateOnePreQueryHook } from 'src/modules/policy/query-hooks/policy-update-one.pre-query.hook';

const WORKSPACE_ID = 'workspace-id';
const USER_WORKSPACE_ID = 'user-workspace-id';
const BROKERAGE_AGENT_ROLE_ID = 'brokerage-agent-role-id';
const POLICY_OBJECT_METADATA_ID = 'policy-object-metadata-id';
const POLICY_AGENT_FIELD_METADATA_ID = 'policy-agent-field-metadata-id';
const POLICY_ID = 'policy-id';
const WORKSPACE_MEMBER_ID = 'workspace-member-id';
const AGENT_PROFILE_ID = 'agent-profile-id';
const OTHER_AGENT_PROFILE_ID = 'other-agent-profile-id';
const NOW = new Date('2026-06-02T12:00:00.000Z');

const createAuthContext = (): AuthContext =>
  ({
    workspace: {
      id: WORKSPACE_ID,
    },
    userWorkspaceId: USER_WORKSPACE_ID,
    workspaceMemberId: WORKSPACE_MEMBER_ID,
  }) as AuthContext;

const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();

const createWorkspaceCacheService = ({
  editWindowMinutes,
  roleUniversalIdentifier = 'brokerage-agent-role-universal-identifier',
  hasPolicyWriteRls = true,
}: {
  editWindowMinutes: number | null;
  roleUniversalIdentifier?: string;
  hasPolicyWriteRls?: boolean;
}) => ({
  getOrRecompute: jest.fn(async (_workspaceId: string, keys: string[]) => {
    const userWorkspaceRoleMap = {
      [USER_WORKSPACE_ID]: BROKERAGE_AGENT_ROLE_ID,
    };

    if (keys.includes('flatObjectMetadataMaps')) {
      return {
        userWorkspaceRoleMap,
        rolesPermissions: {
          [BROKERAGE_AGENT_ROLE_ID]: {
            [POLICY_OBJECT_METADATA_ID]: {
              editWindowMinutes,
              rowLevelPermissionPredicates: hasPolicyWriteRls
                ? [
                    {
                      scope: RowLevelPermissionPredicateScope.WRITE,
                      fieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
                      workspaceMemberFieldMetadataId:
                        'workspace-member-id-field-metadata-id',
                    },
                  ]
                : [],
            },
          },
        },
        flatObjectMetadataMaps: {
          byUniversalIdentifier: {
            'brokerage-policy-object-universal-identifier': {
              id: POLICY_OBJECT_METADATA_ID,
              nameSingular: 'policy',
            },
          },
        },
        flatFieldMetadataMaps: {
          universalIdentifierById: {
            [POLICY_AGENT_FIELD_METADATA_ID]:
              'policy-agent-field-universal-identifier',
          },
          byUniversalIdentifier: {
            'policy-agent-field-universal-identifier': {
              id: POLICY_AGENT_FIELD_METADATA_ID,
              name: 'agent',
            },
          },
        },
      };
    }

    if (keys.includes('flatRoleMaps')) {
      return {
        userWorkspaceRoleMap,
        flatRoleMaps: {
          universalIdentifierById: {
            [BROKERAGE_AGENT_ROLE_ID]: roleUniversalIdentifier,
          },
        },
      };
    }

    throw new Error(`Unexpected workspace cache keys: ${keys.join(', ')}`);
  }),
});

const createGlobalWorkspaceOrmManager = ({
  createdAt,
  agentId = AGENT_PROFILE_ID,
}: {
  createdAt: string;
  agentId?: string;
}) => {
  const policyRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: POLICY_ID,
      createdAt,
      agentId,
    }),
  };

  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn().mockResolvedValue(policyRepository),
  };

  return {
    globalWorkspaceOrmManager,
    policyRepository,
  };
};

const createAgentProfileResolverService = ({
  agentProfileId = AGENT_PROFILE_ID,
}: {
  agentProfileId?: string | null;
} = {}) => ({
  resolveAgentProfileId: jest.fn().mockResolvedValue(agentProfileId),
});

describe('policy edit window pre-query hooks', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('blocks a Brokerage Agent policy updateOne after that role configured edit window', async () => {
    const { globalWorkspaceOrmManager } = createGlobalWorkspaceOrmManager({
      createdAt: minutesAgo(16),
    });
    const workspaceCacheService = createWorkspaceCacheService({
      editWindowMinutes: 15,
    });
    const agentProfileResolverService = createAgentProfileResolverService();
    const hook = new PolicyUpdateOnePreQueryHook(
      globalWorkspaceOrmManager as never,
      workspaceCacheService as never,
      agentProfileResolverService as never,
    );

    await expect(
      hook.execute(createAuthContext(), 'policy', {
        id: POLICY_ID,
        data: {
          premium: 100,
        },
      } as never),
    ).rejects.toThrow(ForbiddenError);
  });

  it('allows non-admin policy updateOne when that role has no configured edit window', async () => {
    const { globalWorkspaceOrmManager } = createGlobalWorkspaceOrmManager({
      createdAt: minutesAgo(16),
    });
    const workspaceCacheService = createWorkspaceCacheService({
      editWindowMinutes: null,
    });
    const payload = {
      id: POLICY_ID,
      data: {
        premium: 100,
      },
    };
    const agentProfileResolverService = createAgentProfileResolverService();
    const hook = new PolicyUpdateOnePreQueryHook(
      globalWorkspaceOrmManager as never,
      workspaceCacheService as never,
      agentProfileResolverService as never,
    );

    await expect(
      hook.execute(createAuthContext(), 'policy', payload as never),
    ).resolves.toBe(payload);
  });

  it('allows administrators to update policies after the configured role edit window', async () => {
    const { globalWorkspaceOrmManager } = createGlobalWorkspaceOrmManager({
      createdAt: minutesAgo(16),
    });
    const workspaceCacheService = createWorkspaceCacheService({
      editWindowMinutes: 15,
      roleUniversalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
    });
    const payload = {
      id: POLICY_ID,
      data: {
        premium: 100,
      },
    };
    const hook = new PolicyUpdateOnePreQueryHook(
      globalWorkspaceOrmManager as never,
      workspaceCacheService as never,
      createAgentProfileResolverService() as never,
    );

    await expect(
      hook.execute(createAuthContext(), 'policy', payload as never),
    ).resolves.toBe(payload);
  });

  it('blocks a Brokerage Agent policy updateMany after that role configured edit window', async () => {
    const { globalWorkspaceOrmManager, policyRepository } =
      createGlobalWorkspaceOrmManager({
        createdAt: minutesAgo(16),
      });
    const workspaceCacheService = createWorkspaceCacheService({
      editWindowMinutes: 15,
    });
    const agentProfileResolverService = createAgentProfileResolverService();
    const hook = new PolicyUpdateManyPreQueryHook(
      globalWorkspaceOrmManager as never,
      workspaceCacheService as never,
      agentProfileResolverService as never,
    );

    await expect(
      hook.execute(createAuthContext(), 'policy', {
        filter: {
          id: {
            in: [POLICY_ID],
          },
        },
        data: {
          premium: 100,
        },
      } as never),
    ).rejects.toThrow(ForbiddenError);

    expect(policyRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: POLICY_ID,
      },
    });
  });

  it('blocks another agent policy updateOne before the edit window check', async () => {
    const { globalWorkspaceOrmManager } = createGlobalWorkspaceOrmManager({
      createdAt: minutesAgo(16),
      agentId: OTHER_AGENT_PROFILE_ID,
    });
    const workspaceCacheService = createWorkspaceCacheService({
      editWindowMinutes: 15,
    });
    const agentProfileResolverService = createAgentProfileResolverService();
    const hook = new PolicyUpdateOnePreQueryHook(
      globalWorkspaceOrmManager as never,
      workspaceCacheService as never,
      agentProfileResolverService as never,
    );

    await expect(
      hook.execute(createAuthContext(), 'policy', {
        id: POLICY_ID,
        data: {
          premium: 100,
        },
      } as never),
    ).rejects.toMatchObject({
      message: 'Editing this record violates row-level security',
      extensions: {
        userFriendlyMessage: {
          message: 'Editing this record violates row-level security.',
        },
      },
    });
  });

  it('blocks another agent policy updateMany before the edit window check', async () => {
    const { globalWorkspaceOrmManager } = createGlobalWorkspaceOrmManager({
      createdAt: minutesAgo(16),
      agentId: OTHER_AGENT_PROFILE_ID,
    });
    const workspaceCacheService = createWorkspaceCacheService({
      editWindowMinutes: 15,
    });
    const agentProfileResolverService = createAgentProfileResolverService();
    const hook = new PolicyUpdateManyPreQueryHook(
      globalWorkspaceOrmManager as never,
      workspaceCacheService as never,
      agentProfileResolverService as never,
    );

    await expect(
      hook.execute(createAuthContext(), 'policy', {
        filter: {
          id: {
            in: [POLICY_ID],
          },
        },
        data: {
          premium: 100,
        },
      } as never),
    ).rejects.toMatchObject({
      message: 'Editing this record violates row-level security',
      extensions: {
        userFriendlyMessage: {
          message: 'Editing this record violates row-level security.',
        },
      },
    });
  });

  it('does not apply agent ownership pre-checks to roles without policy write RLS', async () => {
    const { globalWorkspaceOrmManager } = createGlobalWorkspaceOrmManager({
      createdAt: minutesAgo(16),
      agentId: OTHER_AGENT_PROFILE_ID,
    });
    const workspaceCacheService = createWorkspaceCacheService({
      editWindowMinutes: null,
      hasPolicyWriteRls: false,
    });
    const payload = {
      id: POLICY_ID,
      data: {
        premium: 100,
      },
    };
    const agentProfileResolverService = createAgentProfileResolverService();
    const hook = new PolicyUpdateOnePreQueryHook(
      globalWorkspaceOrmManager as never,
      workspaceCacheService as never,
      agentProfileResolverService as never,
    );

    await expect(
      hook.execute(createAuthContext(), 'policy', payload as never),
    ).resolves.toBe(payload);
    expect(
      agentProfileResolverService.resolveAgentProfileId,
    ).not.toHaveBeenCalled();
  });
});
