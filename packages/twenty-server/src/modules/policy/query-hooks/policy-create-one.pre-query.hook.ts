import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

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

    // Auto-fill LTV from CarrierProduct commission if not already set
    if (
      !isDefined(payload.data.ltv?.amountMicros) &&
      isDefined(payload.data.carrierId) &&
      isDefined(payload.data.productId)
    ) {
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const ltvCommission = await lookupCarrierProductCommission(
            payload.data.carrierId,
            payload.data.productId,
            workspace.id,
            this.globalWorkspaceOrmManager,
          );

          if (ltvCommission) {
            payload.data.ltv = {
              amountMicros: ltvCommission.amountMicros,
              currencyCode: ltvCommission.currencyCode,
            };
          }
        },
        authContext as WorkspaceAuthContext,
      );
    }

    return payload;
  }
}
