import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';
import { buildPolicyDisplayName } from 'src/modules/policy/utils/build-policy-display-name.util';
import { getTodayForMember } from 'src/modules/policy/utils/get-today-for-member.util';

@Injectable()
@WorkspaceQueryHook(`policy.createOne`)
export class PolicyCreateOnePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly agentProfileResolverService: AgentProfileResolverService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute(
    authContext: AuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs,
  ): Promise<CreateOneResolverArgs> {
    const workspace = authContext.workspace;

    if (!isDefined(workspace) || !isDefined(authContext.workspaceMemberId)) {
      return payload;
    }

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      // Auto-set submittedDate to today in the user's timezone
      if (!isDefined(payload.data.submittedDate)) {
        payload.data.submittedDate = await getTodayForMember(
          workspace.id,
          authContext.workspaceMemberId!,
          this.globalWorkspaceOrmManager,
        );
      }

      // Auto-derive name from carrier + product
      if (
        isDefined(payload.data.carrierId) ||
        isDefined(payload.data.productId)
      ) {
        const displayName = await buildPolicyDisplayName(
          (payload.data.carrierId as string) ?? null,
          (payload.data.productId as string) ?? null,
          workspace.id,
          this.globalWorkspaceOrmManager,
        );

        if (displayName) {
          payload.data.name = displayName;
        }
      }
    }, authContext as WorkspaceAuthContext);

    // Auto-assign agent profile
    if (!isDefined(payload.data.agentId)) {
      const agentProfileId =
        await this.agentProfileResolverService.resolveAgentProfileId(
          workspace.id,
          authContext.workspaceMemberId,
        );

      if (isDefined(agentProfileId)) {
        payload.data.agentId = agentProfileId;
      }
    }

    return payload;
  }
}
