import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { findPolicyUpdateTargets } from 'src/modules/policy/query-hooks/utils/find-policy-update-targets.util';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';
import { buildPolicyDisplayName } from 'src/modules/policy/utils/build-policy-display-name.util';

@Injectable()
@WorkspaceQueryHook(`policy.updateOne`)
export class PolicyUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly policyWriteAuthorizationService: PolicyWriteAuthorizationService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs,
  ): Promise<UpdateOneResolverArgs> {
    const isRenaming =
      isDefined(payload.data.carrierId) || isDefined(payload.data.productId);

    if (!isUserAuthContext(authContext) && !isRenaming) {
      return payload;
    }

    const [policy] = await findPolicyUpdateTargets({
      workspaceId: authContext.workspace.id,
      policyIds: [payload.id],
      workspaceOrmManager: this.workspaceOrmManager,
    });

    // The runner reports an unknown id as not found
    if (!isDefined(policy)) {
      return payload;
    }

    await this.policyWriteAuthorizationService.assertUserMayUpdatePolicies({
      authContext,
      policies: [policy],
    });

    if (!isRenaming) {
      return payload;
    }

    // An explicit null clears the field, so only an absent value falls back to the stored one
    const { carrierId = policy.carrierId, productId = policy.productId } =
      payload.data;

    const displayName =
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          buildPolicyDisplayName(
            { carrierId, productId },
            this.workspaceOrmManager,
          ),
        buildSystemAuthContext(authContext.workspace.id),
        { lite: true },
      );

    if (isDefined(displayName)) {
      payload.data.name = displayName;
    }

    return payload;
  }
}
