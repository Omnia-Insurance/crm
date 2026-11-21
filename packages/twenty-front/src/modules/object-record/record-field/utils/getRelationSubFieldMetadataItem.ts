import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isActiveFieldMetadataItem } from '@/object-metadata/utils/isActiveFieldMetadataItem';
import { isNonEmptyString } from '@sniptt/guards';
import { findById, isDefined } from 'twenty-shared/utils';

// Only readableFields: a sub-field the role cannot read must not get a header label or a cell
export const getRelationSubFieldMetadataItem = ({
  targetObjectMetadataId,
  subFieldName,
  objectMetadataItems,
}: {
  targetObjectMetadataId: string | null | undefined;
  subFieldName: string;
  objectMetadataItems: EnrichedObjectMetadataItem[];
}): FieldMetadataItem | null => {
  if (!isNonEmptyString(targetObjectMetadataId)) {
    return null;
  }

  const subFieldMetadataItem = objectMetadataItems
    .find(findById(targetObjectMetadataId))
    ?.readableFields.find(
      (readableFieldMetadataItem) =>
        readableFieldMetadataItem.name === subFieldName,
    );

  if (
    !isDefined(subFieldMetadataItem) ||
    !isActiveFieldMetadataItem({ fieldMetadata: subFieldMetadataItem })
  ) {
    return null;
  }

  return subFieldMetadataItem;
};
