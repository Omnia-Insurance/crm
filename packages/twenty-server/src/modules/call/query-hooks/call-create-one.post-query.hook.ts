import { isDefined } from 'twenty-shared/utils';

import { type ObjectRecord } from 'twenty-shared/types';

import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';

@WorkspaceQueryHook({
  key: `call.createOne`,
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class CallCreateOnePostQueryHook
  implements WorkspacePostQueryHookInstance
{
  constructor(
    private readonly agentProfileResolverService: AgentProfileResolverService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute(
    authContext: AuthContext,
    _objectName: string,
    payload: ObjectRecord[],
  ): Promise<void> {
    const workspace = authContext.workspace;

    if (!isDefined(workspace) || !isDefined(authContext.workspaceMemberId)) {
      return;
    }

    const record = payload[0];

    if (!isDefined(record) || isDefined(record.agentId)) {
      return;
    }

    const agentProfileId =
      await this.agentProfileResolverService.resolveAgentProfileId(
        workspace.id,
        authContext.workspaceMemberId,
      );

    if (!isDefined(agentProfileId)) {
      return;
    }

    const callRepo = await this.globalWorkspaceOrmManager.getRepository(
      workspace.id,
      'call',
      { shouldBypassPermissionChecks: true },
    );

    await callRepo.update(
      { id: record.id },
      { agentId: agentProfileId },
    );

    // Mutate the result so the frontend sees agentId immediately
    record.agentId = agentProfileId;
  }
}
