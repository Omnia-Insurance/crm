import { Injectable } from '@nestjs/common';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { AgentProfileAssignmentService } from 'src/modules/agent-profile/services/agent-profile-assignment.service';

@Injectable()
@WorkspaceQueryHook(`person.createOne`)
export class PersonCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly agentProfileAssignmentService: AgentProfileAssignmentService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs,
  ): Promise<CreateOneResolverArgs> {
    await this.agentProfileAssignmentService.assignAgentProfileToNewRecords({
      authContext,
      objectNameSingular: 'person',
      agentFieldName: 'assignedAgentId',
      records: [payload.data],
      isUpsert: payload.upsert === true,
    });

    return payload;
  }
}
