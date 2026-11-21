import { type ObjectRecordEvent } from 'twenty-shared/database-events';
import { isPlainObject } from 'twenty-shared/utils';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type PermissionsPrincipalsWithRolesContext } from 'src/engine/permissions/principal/types/permissions-principals-with-roles-context.type';
import { type RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import { findTimelineActivitiesDescribingUnreadableRecords } from 'src/modules/timeline/utils/find-timeline-activities-describing-unreadable-records.util';

// An update event carries both snapshots and the diff between them, so each snapshot must describe readable records
const findEventTimelineActivities = (
  event: ObjectRecordEvent,
): Record<string, unknown>[] => {
  const { properties } = event;
  const timelineActivities = [
    'before' in properties ? properties.before : undefined,
    'after' in properties ? properties.after : undefined,
  ].filter(isPlainObject);

  return timelineActivities.length > 0 ? timelineActivities : [{}];
};

// Dropped like the events of any record the reader cannot read, so subscriptions, webhooks and triggers agree
export const filterTimelineActivityEventsDescribingReadableRecords = async <
  TEvent extends ObjectRecordEvent,
>({
  events,
  objectMetadata,
  principals,
  flatObjectMetadataMaps,
  recordPermissionsReadService,
}: {
  events: TEvent[];
  objectMetadata: Pick<FlatObjectMetadata, 'nameSingular'>;
  principals: PermissionsPrincipalsWithRolesContext;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  recordPermissionsReadService: RecordPermissionsReadService;
}): Promise<TEvent[]> => {
  if (
    objectMetadata.nameSingular !== 'timelineActivity' ||
    events.length === 0
  ) {
    return events;
  }

  const timelineActivitiesByEvent = events.map(findEventTimelineActivities);
  const timelineActivitiesDescribingUnreadableRecords =
    await findTimelineActivitiesDescribingUnreadableRecords({
      timelineActivities: timelineActivitiesByEvent.flat(),
      principals,
      flatObjectMetadataMaps,
      recordPermissionsReadService,
    });

  return events.filter((_event, index) =>
    timelineActivitiesByEvent[index].every(
      (timelineActivity) =>
        !timelineActivitiesDescribingUnreadableRecords.has(timelineActivity),
    ),
  );
};
