import { isSystemAuthContext } from 'src/engine/core-modules/auth/guards/is-system-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/permissions/permissions.exception';
import { type TimelineActivityMutationInput } from 'src/modules/timeline/query-hooks/types/timeline-activity-mutation-input.type';

// Targets come as join columns (targetPersonId) or nested relation inputs (targetPerson)
const isTimelineActivityDescriptionFieldName = (fieldName: string): boolean =>
  fieldName.startsWith('target') ||
  fieldName === 'linkedObjectMetadataId' ||
  fieldName === 'linkedRecordId' ||
  fieldName === 'linkedRecordCachedName' ||
  fieldName === 'properties';

// The records an activity describes decide who reads its diff, so a writer moving or unlinking an
// activity could read another record's diff; only system work keeps the description in sync
export const assertTimelineActivityDescriptionIsNotUpdated = ({
  authContext,
  records,
}: {
  authContext: WorkspaceAuthContext;
  records: TimelineActivityMutationInput[];
}): void => {
  if (
    !isSystemAuthContext(authContext) &&
    records.some((record) =>
      Object.keys(record).some(isTimelineActivityDescriptionFieldName),
    )
  ) {
    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
  }
};
