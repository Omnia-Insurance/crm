import { Test } from '@nestjs/testing';

import { FieldMetadataType } from 'twenty-shared/types';
import { In } from 'typeorm';

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
import { DashboardAudienceCreateManyPreQueryHook } from 'src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-many.pre-query.hook';
import { DashboardAudienceCreatorService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-creator.service';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';

const USER_WORKSPACE_ID = 'member-user-workspace-id';

const memberRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.memberRole,
  label: 'Member',
});

const MEMBER_TOKEN = encodeDashboardAudienceRoleToken(memberRole.id);
const STORED_DASHBOARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEW_DASHBOARD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const dashboardIdField = getFlatFieldMetadataMock({
  id: 'dashboard-id-field-id',
  universalIdentifier: 'dashboard-id-field-universal-identifier',
  objectMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
  type: FieldMetadataType.UUID,
  name: 'id',
});

const setup = async () => {
  const workspace = createDashboardAudienceWorkspaceFake({
    roles: [memberRole],
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
    userWorkspaceRoleMap: { [USER_WORKSPACE_ID]: memberRole.id },
  });
  const findStoredDashboards = jest.fn().mockResolvedValue([]);

  const module = await Test.createTestingModule({
    providers: [
      DashboardAudienceCreateManyPreQueryHook,
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
          getRepositoryWithoutPermissionChecks: jest
            .fn()
            .mockReturnValue({ find: findStoredDashboards }),
        },
      },
    ],
  }).compile();

  return {
    hook: module.get(DashboardAudienceCreateManyPreQueryHook),
    findStoredDashboards,
  };
};

const MEMBER_AUTH_CONTEXT = {
  type: 'user',
  workspace: { id: DASHBOARD_AUDIENCE_TEST_IDS.workspace },
  userWorkspaceId: USER_WORKSPACE_ID,
} as WorkspaceAuthContext;

describe('DashboardAudienceCreateManyPreQueryHook', () => {
  it("tags every new dashboard of a gated creator with the creator's role", async () => {
    const { hook, findStoredDashboards } = await setup();

    const result = await hook.execute(MEMBER_AUTH_CONTEXT, 'dashboard', {
      data: [
        { title: 'First' },
        { title: 'Second', audience: [MEMBER_TOKEN] },
        { title: 'Third', audience: null },
      ],
    });

    expect(result.data.map(({ audience }) => audience)).toEqual([
      [MEMBER_TOKEN],
      [MEMBER_TOKEN],
      [MEMBER_TOKEN],
    ]);
    expect(findStoredDashboards).not.toHaveBeenCalled();
  });

  it('keeps the audience of a stored dashboard an upsert updates, and tags only the dashboards it inserts', async () => {
    const { hook, findStoredDashboards } = await setup();

    findStoredDashboards.mockResolvedValue([{ id: STORED_DASHBOARD_ID }]);

    const result = await hook.execute(MEMBER_AUTH_CONTEXT, 'dashboard', {
      data: [
        { id: STORED_DASHBOARD_ID, title: 'Renamed' },
        { id: NEW_DASHBOARD_ID, title: 'New' },
      ],
      upsert: true,
    });

    expect(result.data).toEqual([
      { id: STORED_DASHBOARD_ID, title: 'Renamed' },
      { id: NEW_DASHBOARD_ID, title: 'New', audience: [MEMBER_TOKEN] },
    ]);
    expect(findStoredDashboards).toHaveBeenCalledWith({
      where: [{ id: In([STORED_DASHBOARD_ID, NEW_DASHBOARD_ID]) }],
      select: ['id'],
      withDeleted: true,
    });
  });

  it('leaves dashboards created by the system unchanged', async () => {
    const { hook } = await setup();

    const result = await hook.execute(
      {
        type: 'system',
        workspace: { id: DASHBOARD_AUDIENCE_TEST_IDS.workspace },
      } as WorkspaceAuthContext,
      'dashboard',
      { data: [{ title: 'First' }] },
    );

    expect(result.data).toEqual([{ title: 'First' }]);
  });
});
