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

// Checks relation type from either field.relation.type or field.settings.relationType
// as a fallback when the relation resolver returns null.
const isRelationType = (
  field: FieldMetadataItem,
  type: RelationType,
): boolean =>
  field.relation?.type === type ||
  (field.settings as Record<string, unknown> | null)?.relationType === type;

// Resolves the target object metadata ID for a relation field.
// Uses field.relation.targetObjectMetadata.id when available,
// falling back to searching objectMetadataItems for an inverse relation.
const resolveTargetObjectId = (
  field: FieldMetadataItem,
  objectMetadataItems: ObjectMetadataItem[],
): string | undefined => {
  if (isDefined(field.relation?.targetObjectMetadata.id)) {
    return field.relation.targetObjectMetadata.id;
  }

  // Fallback: search for an inverse relation field across all objects
  // that references this field as its target.
  for (const obj of objectMetadataItems) {
    for (const otherField of obj.fields) {
      if (
        otherField.type === FieldMetadataType.RELATION &&
        otherField.relation?.targetFieldMetadata.id === field.id
      ) {
        return obj.id;
      }
    }
  }

  return undefined;
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
  // Use resolveTargetObjectId to handle cases where relation is null
  // but the target can still be found via inverse relation search.
  const fieldTargetObjectId = resolveTargetObjectId(
    fieldMetadataItem,
    objectMetadataItems,
  );

  if (!isDefined(fieldTargetObjectId)) {
    return undefined;
  }

  // Find sibling MANY_TO_ONE fields on the same object.
  // Uses both relation.type and settings.relationType for robustness.
  const siblingManyToOneFields = objectMetadataItem.fields.filter(
    (field) =>
      field.id !== fieldMetadataItem.id &&
      field.type === FieldMetadataType.RELATION &&
      isRelationType(field, RelationType.MANY_TO_ONE),
  );

  for (const siblingField of siblingManyToOneFields) {
    const siblingTargetObjectId = resolveTargetObjectId(
      siblingField,
      objectMetadataItems,
    );

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
        !isRelationType(targetField, RelationType.ONE_TO_MANY)
      ) {
        continue;
      }

      if (!hasJunctionConfig(targetField.settings)) {
        continue;
      }

      // Resolve the junction object ID from either the relation resolver
      // or by finding the object that contains the junction target field.
      const relationObjectMetadataId = resolveTargetObjectId(
        targetField,
        objectMetadataItems,
      );

      if (!isDefined(relationObjectMetadataId)) {
        continue;
      }

      const junctionConfig = getJunctionConfig({
        settings: targetField.settings,
        relationObjectMetadataId,
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

      const junctionTargetObjectId = resolveTargetObjectId(
        firstTargetField,
        objectMetadataItems,
      );

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

      const targetJoinColumnName = getJoinColumnName(firstTargetField.settings);

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
