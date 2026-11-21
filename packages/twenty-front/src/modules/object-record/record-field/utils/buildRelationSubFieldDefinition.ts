import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type RelationSubFieldMetadata } from '@/object-record/record-field/types/RelationSubFieldMetadata';
import { getRelationSubFieldMetadataItem } from '@/object-record/record-field/utils/getRelationSubFieldMetadataItem';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { isFieldRelation } from '@/object-record/record-field/ui/types/guards/isFieldRelation';
import { getRelationSubFieldColumnLabel } from '@/views/utils/getRelationSubFieldColumnLabel';
import { isDefined } from 'twenty-shared/utils';

export const buildRelationSubFieldDefinition = ({
  relationFieldDefinition,
  subFieldName,
  objectMetadataItems,
}: {
  relationFieldDefinition: FieldDefinition<FieldMetadata>;
  subFieldName: string;
  objectMetadataItems: EnrichedObjectMetadataItem[];
}): FieldDefinition<RelationSubFieldMetadata> | null => {
  if (!isFieldRelation(relationFieldDefinition)) {
    return null;
  }

  const subFieldMetadataItem = getRelationSubFieldMetadataItem({
    targetObjectMetadataId:
      relationFieldDefinition.metadata.relationObjectMetadataId,
    subFieldName,
    objectMetadataItems,
  });

  if (!isDefined(subFieldMetadataItem)) {
    return null;
  }

  // The metadata stays the relation's (fieldName, relationObjectMetadata*): the sub-field display reads the
  // related record through it. Type, default and icon follow the sub-field; the column is read-only, never required
  return {
    ...relationFieldDefinition,
    fieldMetadataId: `${relationFieldDefinition.fieldMetadataId}.${subFieldName}`,
    label: getRelationSubFieldColumnLabel({
      relationFieldLabel: relationFieldDefinition.label,
      subFieldLabel: subFieldMetadataItem.label,
    }),
    type: subFieldMetadataItem.type,
    iconName: subFieldMetadataItem.icon ?? relationFieldDefinition.iconName,
    defaultValue: subFieldMetadataItem.defaultValue,
    editButtonIcon: undefined,
    isUIEditable: false,
    requiredCondition: null,
    metadata: {
      ...relationFieldDefinition.metadata,
      description: subFieldMetadataItem.description,
      isUIEditable: false,
      subFieldName,
    },
  };
};
