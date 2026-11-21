import { isBoolean, isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type PermissionsPrincipalsWithRolesContext } from 'src/engine/permissions/principal/types/permissions-principals-with-roles-context.type';
import { type RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import { getObjectByTargetColumnName } from 'src/modules/timeline/utils/omit-restricted-fields-from-timeline-activity.util';

type DescribedRecord = {
  flatObjectMetadata: FlatObjectMetadata;
  recordId: unknown;
};

// An activity describes its target record and, when linked, its linked record; undefined when neither can be told
const findDescribedRecords = ({
  timelineActivity,
  flatObjectMetadataMaps,
}: {
  timelineActivity: Record<string, unknown>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
}): DescribedRecord[] | undefined => {
  if (!('linkedObjectMetadataId' in timelineActivity)) {
    return undefined;
  }

  const objectByTargetColumnName = getObjectByTargetColumnName(
    flatObjectMetadataMaps,
  );
  const targetRecords = Object.entries(timelineActivity).flatMap(
    ([columnName, recordId]) => {
      const flatObjectMetadata = objectByTargetColumnName.get(columnName);

      return isDefined(flatObjectMetadata) && isNonEmptyString(recordId)
        ? [{ flatObjectMetadata, recordId }]
        : [];
    },
  );
  const { linkedObjectMetadataId, linkedRecordId } = timelineActivity;

  if (!isNonEmptyString(linkedObjectMetadataId)) {
    return targetRecords.length > 0 ? targetRecords : undefined;
  }

  const linkedFlatObjectMetadata = findFlatEntityByIdInFlatEntityMaps({
    flatEntityId: linkedObjectMetadataId,
    flatEntityMaps: flatObjectMetadataMaps,
  });

  return isDefined(linkedFlatObjectMetadata)
    ? [
        ...targetRecords,
        {
          flatObjectMetadata: linkedFlatObjectMetadata,
          recordId: linkedRecordId,
        },
      ]
    : undefined;
};

const buildIsRecordReadable = async ({
  principals,
  flatObjectMetadata,
  recordIds,
  recordPermissionsReadService,
}: {
  principals: PermissionsPrincipalsWithRolesContext;
  flatObjectMetadata: FlatObjectMetadata;
  recordIds: unknown[];
  recordPermissionsReadService: RecordPermissionsReadService;
}): Promise<(recordId: unknown) => boolean> => {
  // true for a reader of every record, false for an object the reader cannot read at all
  const readSQLCondition =
    await recordPermissionsReadService.buildReadRecordsAccessSQLCondition({
      principals,
      objectMetadataId: flatObjectMetadata.id,
      tableAlias: flatObjectMetadata.nameSingular,
    });

  if (isBoolean(readSQLCondition)) {
    return () => readSQLCondition;
  }

  const readableRecordIds =
    await recordPermissionsReadService.filterGrantedRecordIds({
      principals,
      objectMetadataId: flatObjectMetadata.id,
      operationType: 'read',
      recordIds: recordIds.filter(isNonEmptyString),
    });

  return (recordId) =>
    isNonEmptyString(recordId) && readableRecordIds.has(recordId.toLowerCase());
};

// Omnia runs without related record paths, so nothing ties an activity's diff and cached name to the
// row-level security of the records it describes; one read check per described object, batched over its records
export const findTimelineActivitiesDescribingUnreadableRecords = async <
  TTimelineActivity extends Record<string, unknown>,
>({
  timelineActivities,
  principals,
  flatObjectMetadataMaps,
  recordPermissionsReadService,
}: {
  timelineActivities: TTimelineActivity[];
  principals: PermissionsPrincipalsWithRolesContext;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  recordPermissionsReadService: RecordPermissionsReadService;
}): Promise<Set<TTimelineActivity>> => {
  const timelineActivitiesDescribingUnreadableRecords =
    new Set<TTimelineActivity>();
  const describedRecordsByObjectMetadataId = new Map<
    string,
    {
      flatObjectMetadata: FlatObjectMetadata;
      describedRecords: {
        timelineActivity: TTimelineActivity;
        recordId: unknown;
      }[];
    }
  >();

  for (const timelineActivity of timelineActivities) {
    const describedRecords = findDescribedRecords({
      timelineActivity,
      flatObjectMetadataMaps,
    });

    if (!isDefined(describedRecords)) {
      timelineActivitiesDescribingUnreadableRecords.add(timelineActivity);
      continue;
    }

    for (const { flatObjectMetadata, recordId } of describedRecords) {
      const objectDescribedRecords = describedRecordsByObjectMetadataId.get(
        flatObjectMetadata.id,
      ) ?? { flatObjectMetadata, describedRecords: [] };

      objectDescribedRecords.describedRecords.push({
        timelineActivity,
        recordId,
      });
      describedRecordsByObjectMetadataId.set(
        flatObjectMetadata.id,
        objectDescribedRecords,
      );
    }
  }

  await Promise.all(
    [...describedRecordsByObjectMetadataId.values()].map(
      async ({ flatObjectMetadata, describedRecords }) => {
        const isRecordReadable = await buildIsRecordReadable({
          principals,
          flatObjectMetadata,
          recordIds: describedRecords.map(({ recordId }) => recordId),
          recordPermissionsReadService,
        });

        for (const { timelineActivity, recordId } of describedRecords) {
          if (!isRecordReadable(recordId)) {
            timelineActivitiesDescribingUnreadableRecords.add(timelineActivity);
          }
        }
      },
    ),
  );

  return timelineActivitiesDescribingUnreadableRecords;
};
