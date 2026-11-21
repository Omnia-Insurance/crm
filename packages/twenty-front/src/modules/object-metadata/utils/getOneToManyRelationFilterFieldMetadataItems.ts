import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type ObjectPermissionsByObjectMetadataId } from '@/object-metadata/types/ObjectPermissionsByObjectMetadataId';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { isHiddenSystemField } from '@/object-metadata/utils/isHiddenSystemField';
import { isOneToManyRelationField } from '@/object-metadata/utils/isOneToManyRelationField';
import { canReachSomeRecords } from 'twenty-shared/utils';

// Advanced filter only: isFieldMetadataItemFilterable stays many-to-one
// because the RLS predicate builder reads it
export const getOneToManyRelationFilterFieldMetadataItems = ({
  objectMetadataItem,
  objectPermissionsByObjectMetadataId,
}: {
  objectMetadataItem: Pick<EnrichedObjectMetadataItem, 'readableFields'>;
  objectPermissionsByObjectMetadataId: ObjectPermissionsByObjectMetadataId;
}): FieldMetadataItem[] =>
  objectMetadataItem.readableFields.filter(
    (fieldMetadataItem) =>
      fieldMetadataItem.isActive === true &&
      !isHiddenSystemField(fieldMetadataItem) &&
      isOneToManyRelationField(fieldMetadataItem) &&
      canReachSomeRecords({
        objectRecordsPermissions: getObjectPermissionsForObject(
          objectPermissionsByObjectMetadataId,
          fieldMetadataItem.relation.targetObjectMetadata.id,
        ),
        operationType: 'read',
      }),
  );
