import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { AgentProfileAssignmentService } from 'src/modules/agent-profile/services/agent-profile-assignment.service';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';
import { buildPolicyDisplayName } from 'src/modules/policy/utils/build-policy-display-name.util';
import { stampSubmittedDateOnNewPolicies } from 'src/modules/policy/utils/stamp-submitted-date-on-new-policies.util';

// agentId is stamped before the insert because the "Agent is Me" rule checks it on create
@Injectable()
@WorkspaceQueryHook(`policy.createOne`)
export class PolicyCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly agentProfileAssignmentService: AgentProfileAssignmentService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly policyWriteAuthorizationService: PolicyWriteAuthorizationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs,
  ): Promise<CreateOneResolverArgs> {
    if (payload.upsert === true) {
      await this.policyWriteAuthorizationService.assertUserMayUpsertPolicies({
        authContext,
        records: [payload.data],
      });
    }

    await this.agentProfileAssignmentService.assignAgentProfileToNewRecords({
      authContext,
      objectNameSingular: 'policy',
      agentFieldName: 'agentId',
      records: [payload.data],
      isUpsert: payload.upsert === true,
    });

    await stampSubmittedDateOnNewPolicies({
      authContext,
      records: [payload.data],
      isUpsert: payload.upsert === true,
      workspaceCacheService: this.workspaceCacheService,
      workspaceOrmManager: this.workspaceOrmManager,
    });

    if (
      !isDefined(payload.data.carrierId) &&
      !isDefined(payload.data.productId)
    ) {
      return payload;
    }

    const displayName =
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () => buildPolicyDisplayName(payload.data, this.workspaceOrmManager),
        buildSystemAuthContext(authContext.workspace.id),
        { lite: true },
      );

    if (isDefined(displayName)) {
      payload.data.name = displayName;
    }

    return payload;
  }
}
