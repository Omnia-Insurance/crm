import { type ObjectRecord } from 'twenty-shared/types';
import { isPlainObject } from 'twenty-shared/utils';

import { filterFieldNamesInEventProperties } from 'src/engine/permissions/utils/filter-field-names-in-event-properties.util';

// In place, like the visibility handlers. Keys written by apps can hold the record's values too,
// so only the emptied standard keys survive, and both labels of the linked record go
export const omitDescribedRecordValuesFromTimelineActivity = (
  timelineActivity: ObjectRecord,
): void => {
  if ('properties' in timelineActivity) {
    const { properties } = timelineActivity;

    timelineActivity.properties = isPlainObject(properties)
      ? filterFieldNamesInEventProperties({
          properties,
          isFieldNameKept: () => false,
        })
      : null;
  }

  if ('linkedRecordCachedName' in timelineActivity) {
    timelineActivity.linkedRecordCachedName = null;
  }

  if ('searchVector' in timelineActivity) {
    timelineActivity.searchVector = null;
  }
};
