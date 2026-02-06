import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { type FieldDependencyGraph } from '@/object-record/record-field-dependency/types/FieldDependency';
import { getForeignKeyNameFromRelationFieldName } from '@/object-record/utils/getForeignKeyNameFromRelationFieldName';
import { RelationType } from '~/generated-metadata/graphql';

const isManyToOneRelationField = (
  field: FieldMetadataItem,
): boolean => {
  return field.relation?.type === RelationType.MANY_TO_ONE;
};

export const computeFieldDependencyGraph = (
  currentObjectMetadata: ObjectMetadataItem,
  allObjectMetadataItems: ObjectMetadataItem[],
): FieldDependencyGraph => {
  const dependenciesByField: Record<string, import('@/object-record/record-field-dependency/types/FieldDependency').FieldDependency[]> = {};
  const dependentsByField: Record<string, import('@/object-record/record-field-dependency/types/FieldDependency').FieldDependency[]> = {};

  const manyToOneFields = currentObjectMetadata.fields.filter(
    isManyToOneRelationField,
  );

  for (const parentField of manyToOneFields) {
    const parentTargetObjectId =
      parentField.relation?.targetObjectMetadata.id;

    if (!parentTargetObjectId) {
      continue;
    }

    const parentTargetObject = allObjectMetadataItems.find(
      (item) => item.id === parentTargetObjectId,
    );

    if (!parentTargetObject) {
      continue;
    }

    for (const dependentField of manyToOneFields) {
      if (dependentField.id === parentField.id) {
        continue;
      }

      const dependentTargetObjectId =
        dependentField.relation?.targetObjectMetadata.id;

      if (!dependentTargetObjectId) {
        continue;
      }

      const dependentTargetObject = allObjectMetadataItems.find(
        (item) => item.id === dependentTargetObjectId,
      );

      if (!dependentTargetObject) {
        continue;
      }

      const bridgeField = dependentTargetObject.fields.find(
        (field) =>
          field.relation?.type === RelationType.MANY_TO_ONE &&
          field.relation.targetObjectMetadata.id === parentTargetObjectId,
      );

      if (!bridgeField) {
        continue;
      }

      const dependency = {
        dependentFieldName: dependentField.name,
        dependentFieldMetadataId: dependentField.id,
        parentFieldName: parentField.name,
        parentFieldMetadataId: parentField.id,
        bridgeFieldForeignKeyName: getForeignKeyNameFromRelationFieldName(
          bridgeField.name,
        ),
      };

      if (!dependenciesByField[dependentField.name]) {
        dependenciesByField[dependentField.name] = [];
      }
      dependenciesByField[dependentField.name].push(dependency);

      if (!dependentsByField[parentField.name]) {
        dependentsByField[parentField.name] = [];
      }
      dependentsByField[parentField.name].push(dependency);
    }
  }

  return { dependenciesByField, dependentsByField };
};
