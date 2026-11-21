import { Injectable, type OnModuleInit } from '@nestjs/common';

import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { CommonRecordVisibilityService } from 'src/engine/api/common/common-record-visibility/common-record-visibility.service';
import { type RecordVisibilityRestrictionHandler } from 'src/engine/api/common/common-record-visibility/types/record-visibility-restriction-handler.type';
import { isSystemAuthContext } from 'src/engine/core-modules/auth/guards/is-system-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { PrincipalPermissionsReadService } from 'src/engine/permissions/principal-permissions-read.service';
import { RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import { TIMELINE_ACTIVITY_DESCRIBED_RECORD_VALUE_FIELD_NAMES } from 'src/modules/timeline/constants/timeline-activity-described-record-value-field-names.constant';
import { findTimelineActivitiesDescribingUnreadableRecords } from 'src/modules/timeline/utils/find-timeline-activities-describing-unreadable-records.util';
import { omitDescribedRecordValuesFromTimelineActivity } from 'src/modules/timeline/utils/omit-described-record-values-from-timeline-activity.util';
import { omitRestrictedFieldsFromTimelineActivity } from 'src/modules/timeline/utils/omit-restricted-fields-from-timeline-activity.util';

@Injectable()
export class ApplyTimelineActivitiesVisibilityRestrictionsService
  implements RecordVisibilityRestrictionHandler, OnModuleInit
{
  constructor(
    private readonly commonRecordVisibilityService: CommonRecordVisibilityService,
    // OMNIA-CUSTOM: row-level security of the records an activity describes
    private readonly principalPermissionsReadService: PrincipalPermissionsReadService,
    private readonly recordPermissionsReadService: RecordPermissionsReadService,
  ) {}

  onModuleInit() {
    this.commonRecordVisibilityService.registerHandler({
      objectNameSingular: 'timelineActivity',
      handler: this,
    });
  }

  public async applyVisibilityRestrictions({
    records,
    authContext,
    recordReadRestrictions,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
  }: Parameters<
    RecordVisibilityRestrictionHandler['applyVisibilityRestrictions']
  >[0]): Promise<void> {
    // OMNIA-CUSTOM: the values an activity carries show only to readers of every record it describes
    const timelineActivitiesDescribingUnreadableRecords =
      await this.findTimelineActivitiesDescribingUnreadableRecords({
        records,
        authContext,
        flatObjectMetadataMaps,
      });

    for (const timelineActivity of records) {
      // OMNIA-CUSTOM: described records the reader cannot read leave nothing to filter field by field
      if (timelineActivitiesDescribingUnreadableRecords.has(timelineActivity)) {
        omitDescribedRecordValuesFromTimelineActivity(timelineActivity);
        continue;
      }

      if (!('properties' in timelineActivity)) {
        continue;
      }

      timelineActivity.properties = omitRestrictedFieldsFromTimelineActivity({
        properties: timelineActivity.properties,
        timelineActivity,
        recordReadRestrictions,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
      });
    }
  }

  // OMNIA-CUSTOM: system work reads everything; a reader whose permissions cannot be resolved reads none of it
  private async findTimelineActivitiesDescribingUnreadableRecords({
    records,
    authContext,
    flatObjectMetadataMaps,
  }: {
    records: ObjectRecord[];
    authContext: WorkspaceAuthContext;
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  }): Promise<ReadonlySet<ObjectRecord>> {
    const restrictableTimelineActivities = records.filter((timelineActivity) =>
      TIMELINE_ACTIVITY_DESCRIBED_RECORD_VALUE_FIELD_NAMES.some(
        (fieldName) => fieldName in timelineActivity,
      ),
    );

    if (
      restrictableTimelineActivities.length === 0 ||
      isSystemAuthContext(authContext)
    ) {
      return new Set();
    }

    const principals =
      await this.principalPermissionsReadService.resolvePermissionsPrincipals({
        authContext,
      });

    if (!isDefined(principals)) {
      return new Set(restrictableTimelineActivities);
    }

    return findTimelineActivitiesDescribingUnreadableRecords({
      timelineActivities: restrictableTimelineActivities,
      principals,
      flatObjectMetadataMaps,
      recordPermissionsReadService: this.recordPermissionsReadService,
    });
  }
}
