import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { getJoinColumnName } from '@/object-record/record-field/ui/utils/junction/getJoinColumnName';
import { getJunctionConfig } from '@/object-record/record-field/ui/utils/junction/getJunctionConfig';
import { getSourceJoinColumnName } from '@/object-record/record-field/ui/utils/junction/getSourceJoinColumnName';
import { hasJunctionConfig } from '@/object-record/record-field/ui/utils/junction/hasJunctionConfig';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { RelationType } from '~/generated-metadata/graphql';

export type JunctionBridgeDetection = {
  junctionObjectNameSingular: string;
  sourceJoinColumnName: string;
  targetJoinColumnName: string;
  parentFieldName: string;
};

export const detectJunctionBridge = ({
  objectMetadataItem,
  fieldMetadataItem,
  objectMetadataItems,
}: {
  objectMetadataItem: ObjectMetadataItem;
  fieldMetadataItem: FieldMetadataItem;
  objectMetadataItems: ObjectMetadataItem[];
}): JunctionBridgeDetection | undefined => {
  const fieldTargetObjectId =
    fieldMetadataItem.relation?.targetObjectMetadata.id;

  if (!isDefined(fieldTargetObjectId)) {
    return undefined;
  }

  const siblingManyToOneFields = objectMetadataItem.fields.filter(
    (field) =>
      field.id !== fieldMetadataItem.id &&
      field.relation?.type === RelationType.MANY_TO_ONE,
  );

  for (const siblingField of siblingManyToOneFields) {
    const siblingTargetObjectId =
      siblingField.relation?.targetObjectMetadata.id;

    if (!isDefined(siblingTargetObjectId)) {
      continue;
    }

    const siblingTargetObject = objectMetadataItems.find(
      (item) => item.id === siblingTargetObjectId,
    );

    if (!isDefined(siblingTargetObject)) {
      continue;
    }

    for (const targetField of siblingTargetObject.fields) {
      if (
        targetField.type !== FieldMetadataType.RELATION ||
        targetField.relation?.type !== RelationType.ONE_TO_MANY
      ) {
        continue;
      }

      if (!hasJunctionConfig(targetField.settings)) {
        continue;
      }

      const junctionConfig = getJunctionConfig({
        settings: targetField.settings,
        relationObjectMetadataId:
          targetField.relation.targetObjectMetadata.id,
        sourceObjectMetadataId: siblingTargetObjectId,
        objectMetadataItems,
      });

      if (!isDefined(junctionConfig) || junctionConfig.isMorphRelation) {
        continue;
      }

      const firstTargetField = junctionConfig.targetFields[0];

      if (!isDefined(firstTargetField)) {
        continue;
      }

      const junctionTargetObjectId =
        firstTargetField.relation?.targetObjectMetadata.id;

      if (junctionTargetObjectId !== fieldTargetObjectId) {
        continue;
      }

      const { sourceField } = junctionConfig;

      if (
        !isDefined(sourceField) ||
        !isDefined(junctionConfig.junctionObjectMetadata)
      ) {
        continue;
      }

      const sourceJoinColumnName = getSourceJoinColumnName({
        sourceField,
        sourceObjectMetadata: siblingTargetObject,
      });

      const targetJoinColumnName = getJoinColumnName(
        firstTargetField.settings,
      );

      if (
        !isDefined(sourceJoinColumnName) ||
        !isDefined(targetJoinColumnName)
      ) {
        continue;
      }

      return {
        junctionObjectNameSingular:
          junctionConfig.junctionObjectMetadata.nameSingular,
        sourceJoinColumnName,
        targetJoinColumnName,
        parentFieldName: siblingField.name,
      };
    }
  }

  return undefined;
};
