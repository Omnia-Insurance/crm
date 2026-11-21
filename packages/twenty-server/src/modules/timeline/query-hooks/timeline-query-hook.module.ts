import { Module } from '@nestjs/common';

import { CommonRecordVisibilityModule } from 'src/engine/api/common/common-record-visibility/common-record-visibility.module';
import { PermissionsModule } from 'src/engine/permissions/permissions.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { ApplyTimelineActivitiesVisibilityRestrictionsService } from 'src/modules/timeline/query-hooks/apply-timeline-activities-visibility-restrictions.service';
import { TimelineActivityCreateManyPreQueryHook } from 'src/modules/timeline/query-hooks/timeline-activity-create-many.pre-query-hook';
import { TimelineActivityCreateOnePreQueryHook } from 'src/modules/timeline/query-hooks/timeline-activity-create-one.pre-query-hook';
import { TimelineActivityMergeManyPreQueryHook } from 'src/modules/timeline/query-hooks/timeline-activity-merge-many.pre-query-hook';
import { TimelineActivityMutationQueryHookService } from 'src/modules/timeline/query-hooks/timeline-activity-mutation-query-hook.service';
import { TimelineActivityUpdateManyPreQueryHook } from 'src/modules/timeline/query-hooks/timeline-activity-update-many.pre-query-hook';
import { TimelineActivityUpdateOnePreQueryHook } from 'src/modules/timeline/query-hooks/timeline-activity-update-one.pre-query-hook';
import { TimelineActivityWriteAuthorizationService } from 'src/modules/timeline/query-hooks/timeline-activity-write-authorization.service';
import { TimelineActivityModule } from 'src/modules/timeline/timeline-activity.module';

@Module({
  imports: [
    CommonRecordVisibilityModule,
    // OMNIA-CUSTOM: the visibility handler and write checks use the described records' row-level security
    PermissionsModule,
    WorkspaceCacheModule,
    TimelineActivityModule,
  ],
  providers: [
    ApplyTimelineActivitiesVisibilityRestrictionsService,
    TimelineActivityMutationQueryHookService,
    TimelineActivityCreateOnePreQueryHook,
    TimelineActivityCreateManyPreQueryHook,
    TimelineActivityUpdateOnePreQueryHook,
    TimelineActivityUpdateManyPreQueryHook,
    // OMNIA-CUSTOM: only system work merges timeline activities; writers must be able to edit what they describe
    TimelineActivityMergeManyPreQueryHook,
    TimelineActivityWriteAuthorizationService,
  ],
})
export class TimelineQueryHookModule {}
