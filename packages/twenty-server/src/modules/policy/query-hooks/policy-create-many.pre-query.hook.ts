import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

@Injectable()
@WorkspaceQueryHook(`policy.createMany`)
export class PolicyCreateManyPreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly agentProfileResolverService: AgentProfileResolverService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute(
    authContext: AuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs,
  ): Promise<CreateManyResolverArgs> {
    const workspace = authContext.workspace;

    if (!isDefined(workspace) || !isDefined(authContext.workspaceMemberId)) {
      return payload;
    }

    // Auto-assign agent profile
    const recordsWithoutAgent = payload.data.filter(
      (record) => !isDefined(record.agentId),
    );

    if (recordsWithoutAgent.length > 0) {
      const agentProfileId =
        await this.agentProfileResolverService.resolveAgentProfileId(
          workspace.id,
          authContext.workspaceMemberId,
        );

      if (isDefined(agentProfileId)) {
        for (const record of recordsWithoutAgent) {
          record.agentId = agentProfileId;
        }
      }
    }

    // Auto-fill LTV from CarrierProduct commission where not already set
    for (const record of payload.data) {
      if (
        !isDefined(record.ltv?.amountMicros) &&
        isDefined(record.carrierId) &&
        isDefined(record.productId)
      ) {
        const ltvCommission = await lookupCarrierProductCommission(
          record.carrierId,
          record.productId,
          workspace.id,
          this.globalWorkspaceOrmManager,
        );

        if (ltvCommission) {
          record.ltv = {
            amountMicros: ltvCommission.amountMicros,
            currencyCode: ltvCommission.currencyCode,
          };
        }
      }
    }

    return payload;
  }
}
