import { isDefined } from 'twenty-shared/utils';

import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/permissions/permissions.exception';
import { type RecordReadRestrictions } from 'src/engine/permissions/types/record-read-restrictions.type';
import { TIMELINE_ACTIVITY_DESCRIBED_RECORD_VALUE_FIELD_NAMES } from 'src/modules/timeline/constants/timeline-activity-described-record-value-field-names.constant';

// properties holds other objects' field values, so querying it reveals restricted fields
export const assertTimelineActivityPropertiesAreQueryableOrThrow = ({
  objectNameSingular,
  fieldName,
  recordReadRestrictions,
}: {
  objectNameSingular: string;
  fieldName: string;
  recordReadRestrictions: RecordReadRestrictions | undefined;
}): void => {
  if (
    objectNameSingular !== 'timelineActivity' ||
    // OMNIA-CUSTOM: the cached name and its search vector are other records' labels; ordering by either puts them in cursors
    !TIMELINE_ACTIVITY_DESCRIBED_RECORD_VALUE_FIELD_NAMES.some(
      (valueFieldName) => valueFieldName === fieldName,
    )
  ) {
    return;
  }

  if (
    isDefined(recordReadRestrictions) &&
    (recordReadRestrictions.unreadableObjectMetadataIds.size > 0 ||
      recordReadRestrictions.unreadableFieldMetadataIds.size > 0 ||
      // OMNIA-CUSTOM: row-level rules hide records too; restrictions built without them count as restricted
      !isDefined(recordReadRestrictions.rowLevelRestrictedObjectMetadataIds) ||
      recordReadRestrictions.rowLevelRestrictedObjectMetadataIds.size > 0)
  ) {
    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
  }
};
