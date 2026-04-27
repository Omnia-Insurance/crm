import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type ObjectPermission } from '~/generated-metadata/graphql';
import { isDefined } from 'twenty-shared/utils';
import { RowLevelPermissionPredicateScope } from 'twenty-shared/types';

type IsObjectMetadataReadOnlyParams = {
  objectPermissions?: ObjectPermission;
  objectMetadataItem?: Pick<
    EnrichedObjectMetadataItem,
    'isUIReadOnly' | 'isRemote' | 'applicationId'
  >;
};

export const isObjectMetadataReadOnly = ({
  objectPermissions,
  objectMetadataItem,
}: IsObjectMetadataReadOnlyParams) => {
  // OMNIA-CUSTOM: a member with canUpdateObjectRecords=false but a WRITE/ALL
  // scoped row-level predicate (e.g. policy.agent = Me) CAN update some records.
  // Treat the object as not fully read-only so relation dropdowns / pencil
  // icons render. Per-record write restriction is enforced by the predicate.
  const hasWriteScopedRowLevelPredicate =
    objectPermissions?.rowLevelPermissionPredicates?.some(
      (predicate) =>
        predicate.scope === RowLevelPermissionPredicateScope.ALL ||
        predicate.scope === RowLevelPermissionPredicateScope.WRITE,
    ) ?? false;

  return (
    (isDefined(objectPermissions) &&
      !objectPermissions.canUpdateObjectRecords &&
      !hasWriteScopedRowLevelPredicate) ||
    (isDefined(objectMetadataItem) &&
      (objectMetadataItem.isUIReadOnly || objectMetadataItem.isRemote))
  );
};
