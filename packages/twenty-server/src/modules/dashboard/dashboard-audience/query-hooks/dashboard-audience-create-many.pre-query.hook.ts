import { Injectable } from '@nestjs/common';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { DashboardAudienceCreatorService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-creator.service';

// Runs beside upstream's dashboard.createMany hook; both edit the payload in place, so the merge keeps both
@Injectable()
@WorkspaceQueryHook(`dashboard.createMany`)
export class DashboardAudienceCreateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly dashboardAudienceCreatorService: DashboardAudienceCreatorService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs,
  ): Promise<CreateManyResolverArgs> {
    await this.dashboardAudienceCreatorService.tagNewDashboards({
      authContext,
      dashboards: payload.data,
      isUpsert: payload.upsert === true,
    });

    return payload;
  }
}
