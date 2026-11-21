import { Injectable } from '@nestjs/common';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type MergeManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { findPolicyUpdateTargets } from 'src/modules/policy/query-hooks/utils/find-policy-update-targets.util';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';

// A merge rewrites the kept policy and deletes the others, so every merged policy is checked as an edit
@Injectable()
@WorkspaceQueryHook(`policy.mergeMany`)
export class PolicyMergeManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly policyWriteAuthorizationService: PolicyWriteAuthorizationService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: MergeManyResolverArgs,
  ): Promise<MergeManyResolverArgs> {
    // A dry run only previews the merged record
    if (!isUserAuthContext(authContext) || payload.dryRun === true) {
      return payload;
    }

    const policies = await findPolicyUpdateTargets({
      workspaceId: authContext.workspace.id,
      policyIds: payload.ids,
      workspaceOrmManager: this.workspaceOrmManager,
    });

    await this.policyWriteAuthorizationService.assertUserMayUpdatePolicies({
      authContext,
      policies,
    });

    return payload;
  }
}
