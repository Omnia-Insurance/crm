import { type Module } from '@nestjs/core/injector/module';
import { Test } from '@nestjs/testing';

import { FieldMetadataType } from 'twenty-shared/types';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';

import { WorkspaceQueryHookStorage } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/storage/workspace-query-hook.storage';
import { type WorkspaceQueryHookExplorer } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.explorer';
import { WorkspaceQueryHookService } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.service';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import {
  buildAudienceFieldMock,
  buildAudienceOptionMock,
  buildFlatRoleMock,
  createDashboardAudienceWorkspaceFake,
  DASHBOARD_AUDIENCE_TEST_IDS,
  DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
} from 'src/modules/dashboard/dashboard-audience/__mocks__/dashboard-audience-workspace.mock';
import { DashboardAudienceCreateOnePreQueryHook } from 'src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-one.pre-query.hook';
import { DashboardAudienceCreatorService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-creator.service';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';
import { DashboardCreateOnePreQueryHook } from 'src/modules/dashboard/query-hooks/dashboard-create-one.pre-query.hook';
import { type DashboardToPageLayoutSyncService } from 'src/modules/dashboard/services/dashboard-to-page-layout-sync.service';

const MEMBER_USER_WORKSPACE_ID = 'member-user-workspace-id';
const ADMIN_USER_WORKSPACE_ID = 'admin-user-workspace-id';
const UNSYNCED_USER_WORKSPACE_ID = 'unsynced-user-workspace-id';

const memberRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.memberRole,
  label: 'Member',
});
const adminRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.adminRole,
  label: 'Admin',
  isEditable: false,
  canUpdateAllSettings: true,
});
const unsyncedRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.agentRole,
  label: 'Agent',
});

const MEMBER_TOKEN = encodeDashboardAudienceRoleToken(memberRole.id);
const STORED_DASHBOARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const dashboardIdField = getFlatFieldMetadataMock({
  id: 'dashboard-id-field-id',
  universalIdentifier: 'dashboard-id-field-universal-identifier',
  objectMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
  type: FieldMetadataType.UUID,
  name: 'id',
});

const buildUserAuthContext = (userWorkspaceId: string) =>
  ({
    type: 'user',
    workspace: { id: DASHBOARD_AUDIENCE_TEST_IDS.workspace },
    userWorkspaceId,
  }) as WorkspaceAuthContext;

const setup = async () => {
  const workspace = createDashboardAudienceWorkspaceFake({
    roles: [memberRole, adminRole, unsyncedRole],
    objectMetadatas: [
      {
        ...DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
        fieldIds: [dashboardIdField.id],
      },
    ],
    fieldMetadatas: [
      buildAudienceFieldMock([
        buildAudienceOptionMock({
          roleId: memberRole.id,
          label: 'Member',
          position: 0,
        }),
      ]),
      dashboardIdField,
    ],
    userWorkspaceRoleMap: {
      [MEMBER_USER_WORKSPACE_ID]: memberRole.id,
      [ADMIN_USER_WORKSPACE_ID]: adminRole.id,
      [UNSYNCED_USER_WORKSPACE_ID]: unsyncedRole.id,
    },
  });

  const module = await Test.createTestingModule({
    providers: [
      DashboardAudienceCreateOnePreQueryHook,
      DashboardAudienceCreatorService,
      {
        provide: WorkspaceCacheService,
        useValue: workspace.workspaceCacheService,
      },
      {
        provide: WorkspaceOrmManager,
        useValue: {
          executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
            callback(),
          ),
          getRepositoryWithoutPermissionChecks: jest.fn().mockReturnValue({
            find: jest.fn(async ({ where }: { where: { id: unknown }[] }) =>
              JSON.stringify(where).includes(STORED_DASHBOARD_ID)
                ? [{ id: STORED_DASHBOARD_ID }]
                : [],
            ),
          }),
        },
      },
    ],
  }).compile();

  return module.get(DashboardAudienceCreateOnePreQueryHook);
};

describe('DashboardAudienceCreateOnePreQueryHook', () => {
  it("tags a gated creator's new dashboard with the creator's role once", async () => {
    const hook = await setup();

    const tagged = await hook.execute(
      buildUserAuthContext(MEMBER_USER_WORKSPACE_ID),
      'dashboard',
      { data: { title: 'Sales' } },
    );

    expect(tagged.data.audience).toEqual([MEMBER_TOKEN]);

    const alreadyTagged = await hook.execute(
      buildUserAuthContext(MEMBER_USER_WORKSPACE_ID),
      'dashboard',
      { data: { title: 'Sales', audience: ['ROLE_OTHER', MEMBER_TOKEN] } },
    );

    expect(alreadyTagged.data.audience).toEqual(['ROLE_OTHER', MEMBER_TOKEN]);
  });

  it('keeps the audience the creator picked and adds their own role', async () => {
    const hook = await setup();

    const result = await hook.execute(
      buildUserAuthContext(MEMBER_USER_WORKSPACE_ID),
      'dashboard',
      { data: { audience: ['ROLE_OTHER'] } },
    );

    expect(result.data.audience).toEqual(['ROLE_OTHER', MEMBER_TOKEN]);
  });

  it('leaves the audience of a stored dashboard an upsert updates', async () => {
    const hook = await setup();

    const updated = await hook.execute(
      buildUserAuthContext(MEMBER_USER_WORKSPACE_ID),
      'dashboard',
      { data: { id: STORED_DASHBOARD_ID, title: 'Renamed' }, upsert: true },
    );
    const inserted = await hook.execute(
      buildUserAuthContext(MEMBER_USER_WORKSPACE_ID),
      'dashboard',
      { data: { title: 'New' }, upsert: true },
    );

    expect(updated.data).toEqual({ id: STORED_DASHBOARD_ID, title: 'Renamed' });
    expect(inserted.data).toEqual({ title: 'New', audience: [MEMBER_TOKEN] });
  });

  it('leaves dashboards of admin-like creators, API keys and unsynced roles unchanged', async () => {
    const hook = await setup();

    const adminResult = await hook.execute(
      buildUserAuthContext(ADMIN_USER_WORKSPACE_ID),
      'dashboard',
      { data: { title: 'Board' } },
    );
    const apiKeyResult = await hook.execute(
      {
        type: 'apiKey',
        workspace: { id: DASHBOARD_AUDIENCE_TEST_IDS.workspace },
      } as WorkspaceAuthContext,
      'dashboard',
      { data: { title: 'Board' } },
    );
    const unsyncedResult = await hook.execute(
      buildUserAuthContext(UNSYNCED_USER_WORKSPACE_ID),
      'dashboard',
      { data: { title: 'Board' } },
    );

    for (const result of [adminResult, apiKeyResult, unsyncedResult]) {
      expect(result.data).toEqual({ title: 'Board' });
    }
  });

  it("keeps upstream's page layout and the creator's role when both createOne hooks run", async () => {
    const hook = await setup();
    const upstreamHook = new DashboardCreateOnePreQueryHook({
      createPageLayoutForDashboard: jest.fn(async () => 'page-layout-id'),
    } as unknown as DashboardToPageLayoutSyncService);
    const workspaceQueryHookStorage = new WorkspaceQueryHookStorage();

    for (const instance of [upstreamHook, hook]) {
      workspaceQueryHookStorage.registerWorkspaceQueryPreHookInstance(
        'dashboard.createOne',
        { instance, host: {} as Module, isRequestScoped: false },
      );
    }

    const workspaceQueryHookService = new WorkspaceQueryHookService(
      workspaceQueryHookStorage,
      {
        handlePreHook: async (
          executeParams: Parameters<WorkspacePreQueryHookInstance['execute']>,
          instance: WorkspacePreQueryHookInstance,
        ) => instance.execute(...executeParams),
      } as unknown as WorkspaceQueryHookExplorer,
    );

    const result = await workspaceQueryHookService.executePreQueryHooks(
      buildUserAuthContext(MEMBER_USER_WORKSPACE_ID),
      'dashboard',
      'createOne',
      { data: { title: 'Sales' } },
    );

    expect(result.data).toEqual({
      title: 'Sales',
      pageLayoutId: 'page-layout-id',
      audience: [MEMBER_TOKEN],
    });
  });
});
