import { Test } from '@nestjs/testing';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import {
  buildAudienceFieldMock,
  buildAudienceOptionMock,
  buildFlatRoleMock,
  createDashboardAudienceWorkspaceFake,
  DASHBOARD_AUDIENCE_TEST_IDS,
} from 'src/modules/dashboard/dashboard-audience/__mocks__/dashboard-audience-workspace.mock';
import { DashboardAudienceCreatorService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-creator.service';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';

const MEMBER_USER_WORKSPACE_ID = 'member-user-workspace-id';
const ADMIN_USER_WORKSPACE_ID = 'admin-user-workspace-id';

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

const buildUserAuthContext = (userWorkspaceId: string) =>
  ({
    type: 'user',
    workspace: { id: DASHBOARD_AUDIENCE_TEST_IDS.workspace },
    userWorkspaceId,
  }) as WorkspaceAuthContext;

const setup = async () => {
  const workspace = createDashboardAudienceWorkspaceFake({
    roles: [memberRole, adminRole],
    fieldMetadatas: [
      buildAudienceFieldMock([
        buildAudienceOptionMock({
          roleId: memberRole.id,
          label: 'Member',
          position: 0,
        }),
      ]),
    ],
    userWorkspaceRoleMap: {
      [MEMBER_USER_WORKSPACE_ID]: memberRole.id,
      [ADMIN_USER_WORKSPACE_ID]: adminRole.id,
    },
  });

  const module = await Test.createTestingModule({
    providers: [
      DashboardAudienceCreatorService,
      {
        provide: WorkspaceCacheService,
        useValue: workspace.workspaceCacheService,
      },
      { provide: WorkspaceOrmManager, useValue: {} },
    ],
  }).compile();

  return module.get(DashboardAudienceCreatorService);
};

describe('DashboardAudienceCreatorService', () => {
  describe('buildNewDashboardAudienceFields', () => {
    it("gives a gated creator's dashboard the creator's audience token", async () => {
      const service = await setup();

      await expect(
        service.buildNewDashboardAudienceFields(
          buildUserAuthContext(MEMBER_USER_WORKSPACE_ID),
        ),
      ).resolves.toEqual({
        audience: [encodeDashboardAudienceRoleToken(memberRole.id)],
      });
    });

    it('adds nothing for admin-like creators and system writes', async () => {
      const service = await setup();

      await expect(
        service.buildNewDashboardAudienceFields(
          buildUserAuthContext(ADMIN_USER_WORKSPACE_ID),
        ),
      ).resolves.toEqual({});
      await expect(
        service.buildNewDashboardAudienceFields({
          type: 'system',
          workspace: { id: DASHBOARD_AUDIENCE_TEST_IDS.workspace },
        } as WorkspaceAuthContext),
      ).resolves.toEqual({});
    });
  });
});
