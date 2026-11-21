import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { createCreateCompleteDashboardTool } from 'src/modules/dashboard/tools/create-complete-dashboard.tool';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const AUTH_CONTEXT = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
} as WorkspaceAuthContext;
const PAGE_LAYOUT_ID = '20202020-cccc-4d02-bf25-6aeccf7ea419';

const buildDeps = ({ insert }: { insert: jest.Mock }) => {
  const destroy = jest.fn().mockResolvedValue(true);

  return {
    destroy,
    deps: {
      pageLayoutService: {
        create: jest.fn().mockResolvedValue({ id: PAGE_LAYOUT_ID }),
        destroy,
      },
      pageLayoutTabService: {
        create: jest.fn().mockResolvedValue({ id: 'tab-id' }),
      },
      pageLayoutWidgetService: { create: jest.fn() },
      flatEntityMapsCacheService: {
        getOrRecomputeManyOrAllFlatEntityMaps: jest.fn(),
      },
      recordPositionService: {
        buildRecordPosition: jest.fn().mockResolvedValue(1),
      },
      workspaceOrmManager: {
        executeInWorkspaceContext: jest
          .fn()
          .mockImplementation(async (fn) => fn()),
        getRepository: jest.fn().mockReturnValue({ insert }),
      },
      // OMNIA-CUSTOM: {} is what admins and non-user contexts get, so the upstream cases keep their behaviour
      dashboardAudienceCreatorService: {
        buildNewDashboardAudienceFields: jest.fn().mockResolvedValue({}),
      },
    },
  };
};

describe('createCreateCompleteDashboardTool', () => {
  it('destroys the page layout when the permission-checked dashboard insert fails', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('Permission denied'));
    const { deps, destroy } = buildDeps({ insert });

    const tool = createCreateCompleteDashboardTool(deps, {
      workspaceId: WORKSPACE_ID,
      authContext: AUTH_CONTEXT,
    });

    const result = await tool.execute({ title: 'Revenue' });

    expect(result.success).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledWith({
      id: PAGE_LAYOUT_ID,
      workspaceId: WORKSPACE_ID,
      isLinkedDashboardAlreadyDestroyed: true,
    });
  });

  it('leaves the page layout in place when the dashboard insert succeeds', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const { deps, destroy } = buildDeps({ insert });

    const tool = createCreateCompleteDashboardTool(deps, {
      workspaceId: WORKSPACE_ID,
      authContext: AUTH_CONTEXT,
    });

    const result = await tool.execute({ title: 'Revenue' });

    expect(result.success).toBe(true);
    expect(destroy).not.toHaveBeenCalled();
  });

  // OMNIA-CUSTOM: a gated creator's audience rule refuses a new dashboard without the creator's token
  it("tags a gated creator's dashboard with the creator's audience token", async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const { deps } = buildDeps({ insert });

    deps.dashboardAudienceCreatorService.buildNewDashboardAudienceFields.mockResolvedValue(
      { audience: ['ROLE_X'] },
    );

    const tool = createCreateCompleteDashboardTool(deps, {
      workspaceId: WORKSPACE_ID,
      authContext: AUTH_CONTEXT,
    });

    const result = await tool.execute({ title: 'Revenue' });

    expect(result.success).toBe(true);
    expect(
      deps.dashboardAudienceCreatorService.buildNewDashboardAudienceFields,
    ).toHaveBeenCalledWith(AUTH_CONTEXT);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Revenue',
        pageLayoutId: PAGE_LAYOUT_ID,
        audience: ['ROLE_X'],
      }),
    );
  });

  it('adds no audience when the creator has no audience token', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const { deps } = buildDeps({ insert });

    const tool = createCreateCompleteDashboardTool(deps, {
      workspaceId: WORKSPACE_ID,
      authContext: AUTH_CONTEXT,
    });

    await tool.execute({ title: 'Revenue' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).not.toHaveProperty('audience');
  });
});
