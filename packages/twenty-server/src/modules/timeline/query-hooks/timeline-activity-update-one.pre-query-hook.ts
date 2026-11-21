import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type TimelineActivityMutationInput } from 'src/modules/timeline/query-hooks/types/timeline-activity-mutation-input.type';
import { assertTimelineActivityDescriptionIsNotUpdated } from 'src/modules/timeline/query-hooks/utils/assert-timeline-activity-description-is-not-updated.util';
import {
  assertTimelineActivityTypeIsNotUpdated,
  sanitizeApplicationTimelineActivityInput,
} from 'src/modules/timeline/query-hooks/utils/timeline-activity-mutation-input.util';

@WorkspaceQueryHook('timelineActivity.updateOne')
export class TimelineActivityUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs<TimelineActivityMutationInput>,
  ): Promise<UpdateOneResolverArgs<TimelineActivityMutationInput>> {
    const data =
      authContext.type === 'application'
        ? sanitizeApplicationTimelineActivityInput({ record: payload.data })
        : payload.data;

    assertTimelineActivityTypeIsNotUpdated([data]);
    // OMNIA-CUSTOM: moving or unlinking an activity would hand its diff to readers of the new record
    assertTimelineActivityDescriptionIsNotUpdated({
      authContext,
      records: [data],
    });

    return { ...payload, data };
  }
}
