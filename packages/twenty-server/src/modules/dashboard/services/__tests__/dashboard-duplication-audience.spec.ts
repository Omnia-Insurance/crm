import { Test } from '@nestjs/testing';

import { appendCopySuffix } from 'twenty-shared/utils';

import { ActorFromAuthContextService } from 'src/engine/core-modules/actor/services/actor-from-auth-context.service';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { PageLayoutDuplicationService } from 'src/engine/metadata-modules/page-layout/services/page-layout-duplication.service';
import { PageLayoutService } from 'src/engine/metadata-modules/page-layout/services/page-layout.service';
import { RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { DashboardAudienceCreatorService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-creator.service';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';
import { DashboardDuplicationService } from 'src/modules/dashboard/services/dashboard-duplication.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const DASHBOARD_OBJECT_ID = '20202020-2d36-4e13-8c36-7bfddf8fb52a';
const SOURCE_DASHBOARD_ID = '20202020-3e47-4f24-9d47-8c0eef9fc63b';
const COPY_DASHBOARD_ID = '20202020-4f58-4035-ae58-9d1ff0a0d74c';
const COPY_PAGE_LAYOUT_ID = '20202020-5069-4146-bf69-ae2001b1e85d';
const MEMBER_ROLE_ID = '20202020-617a-4257-807a-bf3112c2f96e';
const MEMBER_AUDIENCE_TOKEN = encodeDashboardAudienceRoleToken(MEMBER_ROLE_ID);

const AUTH_CONTEXT = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
  userWorkspaceId: 'member-user-workspace-id',
} as WorkspaceAuthContext;

const WORKSPACE_CONTEXT = {
  permissionsPrincipals: {},
  objectIdByNameSingular: { dashboard: DASHBOARD_OBJECT_ID },
} as unknown as ORMWorkspaceContext;

const SOURCE_DASHBOARD = {
  id: SOURCE_DASHBOARD_ID,
  title: 'Retention',
  pageLayoutId: '20202020-718b-4368-918b-c04223d30a7f',
  position: 3,
};

const COPY_RECORD = {
  title: appendCopySuffix(SOURCE_DASHBOARD.title),
  pageLayoutId: COPY_PAGE_LAYOUT_ID,
  position: SOURCE_DASHBOARD.position,
};

const setup = async ({
  audienceFields,
}: {
  audienceFields: Record<string, string[]>;
}) => {
  const insert = jest
    .fn()
    .mockResolvedValue({ identifiers: [{ id: COPY_DASHBOARD_ID }] });
  const findOne = jest
    .fn()
    .mockResolvedValueOnce(SOURCE_DASHBOARD)
    .mockResolvedValueOnce({
      id: COPY_DASHBOARD_ID,
      ...COPY_RECORD,
      createdAt: '2026-11-18T10:00:00.000Z',
      updatedAt: '2026-11-18T10:00:00.000Z',
    });
  const buildNewDashboardAudienceFields = jest
    .fn()
    .mockResolvedValue(audienceFields);

  const module = await Test.createTestingModule({
    providers: [
      DashboardDuplicationService,
      {
        provide: PageLayoutDuplicationService,
        useValue: {
          duplicate: jest.fn().mockResolvedValue({ id: COPY_PAGE_LAYOUT_ID }),
        },
      },
      { provide: PageLayoutService, useValue: { destroy: jest.fn() } },
      {
        provide: WorkspaceOrmManager,
        useValue: {
          executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
            withWorkspaceContext(WORKSPACE_CONTEXT, callback),
          ),
          getRepository: jest.fn().mockReturnValue({ findOne, insert }),
        },
      },
      {
        provide: ActorFromAuthContextService,
        useValue: {
          injectActorFieldsOnCreate: jest.fn(
            async ({ records }: { records: Record<string, unknown>[] }) =>
              records,
          ),
        },
      },
      {
        provide: RecordPermissionsReadService,
        useValue: { canAccessSomeRecords: jest.fn().mockResolvedValue(true) },
      },
      {
        provide: DashboardAudienceCreatorService,
        useValue: { buildNewDashboardAudienceFields },
      },
    ],
  }).compile();

  return {
    service: module.get(DashboardDuplicationService),
    insert,
    buildNewDashboardAudienceFields,
  };
};

describe('DashboardDuplicationService dashboard audience', () => {
  it("tags a gated creator's copy with the creator's audience token", async () => {
    const { service, insert, buildNewDashboardAudienceFields } = await setup({
      audienceFields: { audience: [MEMBER_AUDIENCE_TOKEN] },
    });

    const duplicatedDashboard = await service.duplicateDashboard(
      SOURCE_DASHBOARD_ID,
      AUTH_CONTEXT,
    );

    expect(buildNewDashboardAudienceFields).toHaveBeenCalledWith(AUTH_CONTEXT);
    expect(insert).toHaveBeenCalledWith({
      ...COPY_RECORD,
      audience: [MEMBER_AUDIENCE_TOKEN],
    });
    expect(duplicatedDashboard.id).toBe(COPY_DASHBOARD_ID);
  });

  it("leaves an admin's copy without an audience", async () => {
    const { service, insert } = await setup({ audienceFields: {} });

    const duplicatedDashboard = await service.duplicateDashboard(
      SOURCE_DASHBOARD_ID,
      AUTH_CONTEXT,
    );

    expect(insert).toHaveBeenCalledWith(COPY_RECORD);
    expect(insert.mock.calls[0][0]).not.toHaveProperty('audience');
    expect(duplicatedDashboard.id).toBe(COPY_DASHBOARD_ID);
  });
});
