import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { isOneToManyRelationField } from '@/object-metadata/utils/isOneToManyRelationField';
import { isCompositeFilterableFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFilterableFieldType';
import { getFilterTypeFromFieldType } from 'twenty-shared/utils';

export const getAdvancedFilterFieldSubPage = (
  fieldMetadataItem: FieldMetadataItem,
): 'relation-target' | 'composite' | null => {
  if (isManyToOneRelationField(fieldMetadataItem)) {
    return 'relation-target';
  }

  // OMNIA-CUSTOM: one-to-many relations pick has any / has no or a target
  // field; the server evaluates the traversal as EXISTS with the target's RLS
  if (isOneToManyRelationField(fieldMetadataItem)) {
    return 'relation-target';
  }

  if (
    isCompositeFilterableFieldType(
      getFilterTypeFromFieldType(fieldMetadataItem.type),
    )
  ) {
    return 'composite';
  }

  return null;
};
