import { Injectable } from '@nestjs/common';

import { type ObjectRecord } from 'twenty-shared/types';

import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { enrichPolicyAfterSave } from 'src/modules/policy/utils/enrich-policy-after-save.util';

@Injectable()
@WorkspaceQueryHook({
  key: `policy.updateMany`,
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class PolicyUpdateManyPostQueryHook implements WorkspacePostQueryHookInstance {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: ObjectRecord[],
  ): Promise<void> {
    await this.workspaceOrmManager.executeInWorkspaceContext(
      () => enrichPolicyAfterSave(payload, this.workspaceOrmManager),
      buildSystemAuthContext(authContext.workspace.id),
    );
  }
}
