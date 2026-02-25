import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';
import { buildPolicyDisplayName } from 'src/modules/policy/utils/build-policy-display-name.util';
import { getTodayForMember } from 'src/modules/policy/utils/get-today-for-member.util';

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

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      // Auto-set submittedDate to today in the user's timezone
      const recordsWithoutDate = payload.data.filter(
        (record) => !isDefined(record.submittedDate),
      );

      if (recordsWithoutDate.length > 0) {
        const today = await getTodayForMember(
          workspace.id,
          authContext.workspaceMemberId!,
          this.globalWorkspaceOrmManager,
        );

        for (const record of recordsWithoutDate) {
          record.submittedDate = today;
        }
      }

      // Auto-derive name from carrier + product
      for (const record of payload.data) {
        if (isDefined(record.carrierId) || isDefined(record.productId)) {
          const displayName = await buildPolicyDisplayName(
            (record.carrierId as string) ?? null,
            (record.productId as string) ?? null,
            workspace.id,
            this.globalWorkspaceOrmManager,
          );

          if (displayName) {
            record.name = displayName;
          }
        }
      }
    }, authContext as WorkspaceAuthContext);

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

    return payload;
  }
}
