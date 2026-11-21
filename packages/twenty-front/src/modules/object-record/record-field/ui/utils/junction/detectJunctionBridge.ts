import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getSourceJoinColumnName } from '@/object-record/record-field/ui/utils/junction/getSourceJoinColumnName';
import { getTargetObjectMetadataIdsFromField } from '@/object-record/record-field/ui/utils/junction/getTargetObjectMetadataIdsFromField';
import { isUsableJunctionConfig } from '@/object-record/record-field/ui/utils/junction/isUsableJunctionConfig';
import { resolveJunctionConfig } from '@/object-record/record-field/ui/utils/junction/resolveJunctionConfig';
import { FieldMetadataType } from 'twenty-shared/types';
import {
  computeRelationGqlFieldJoinColumnName,
  isDefined,
} from 'twenty-shared/utils';
import { RelationType } from '~/generated-metadata/graphql';

export type JunctionBridge = {
  junctionObjectNameSingular: string;
  sourceJoinColumnName: string;
  targetJoinColumnName: string;
  parentFieldName: string;
};

const isRelationFieldOfType = (
  fieldMetadataItem: FieldMetadataItem,
  relationType: RelationType,
) =>
  fieldMetadataItem.type === FieldMetadataType.RELATION &&
  fieldMetadataItem.relation?.type === relationType;

// Finds the junction that bridges a relation through a to-one sibling:
// Policy.product -> Product is reachable from Policy.carrier -> Carrier
// through Carrier.carrierProducts -> CarrierProduct.product.
export const detectJunctionBridge = ({
  objectMetadataItem,
  fieldMetadataItem,
  objectMetadataItems,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  fieldMetadataItem: FieldMetadataItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
}): JunctionBridge | undefined => {
  const [fieldTargetObjectMetadataId] =
    getTargetObjectMetadataIdsFromField(fieldMetadataItem);

  if (
    fieldMetadataItem.type !== FieldMetadataType.RELATION ||
    !isDefined(fieldTargetObjectMetadataId)
  ) {
    return undefined;
  }

  const siblingManyToOneFields = objectMetadataItem.fields.filter(
    (field) =>
      field.id !== fieldMetadataItem.id &&
      isRelationFieldOfType(field, RelationType.MANY_TO_ONE),
  );

  for (const siblingField of siblingManyToOneFields) {
    const [parentObjectMetadataId] =
      getTargetObjectMetadataIdsFromField(siblingField);

    const parentObjectMetadataItem = objectMetadataItems.find(
      ({ id }) => id === parentObjectMetadataId,
    );

    if (!isDefined(parentObjectMetadataItem)) {
      continue;
    }

    for (const parentField of parentObjectMetadataItem.fields) {
      if (
        !isRelationFieldOfType(parentField, RelationType.ONE_TO_MANY) ||
        !isDefined(parentField.relation)
      ) {
        continue;
      }

      const junctionConfig = resolveJunctionConfig({
        settings: parentField.settings,
        relationObjectMetadataId: parentField.relation.targetObjectMetadata.id,
        relationTargetFieldMetadataId:
          parentField.relation.targetFieldMetadata.id,
        sourceObjectMetadataId: parentObjectMetadataItem.id,
        objectMetadataItems,
      });

      if (
        !isUsableJunctionConfig(junctionConfig) ||
        junctionConfig.isMorphRelation ||
        !isDefined(junctionConfig.sourceField)
      ) {
        continue;
      }

      const [junctionTargetField] = junctionConfig.targetFields;

      if (
        !isDefined(junctionTargetField) ||
        !getTargetObjectMetadataIdsFromField(junctionTargetField).includes(
          fieldTargetObjectMetadataId,
        )
      ) {
        continue;
      }

      const sourceJoinColumnName = getSourceJoinColumnName({
        sourceField: junctionConfig.sourceField,
        sourceObjectMetadata: parentObjectMetadataItem,
      });

      if (!isDefined(sourceJoinColumnName)) {
        continue;
      }

      return {
        junctionObjectNameSingular:
          junctionConfig.junctionObjectMetadata.nameSingular,
        sourceJoinColumnName,
        targetJoinColumnName: computeRelationGqlFieldJoinColumnName({
          name: junctionTargetField.name,
        }),
        parentFieldName: siblingField.name,
      };
    }
  }

  return undefined;
};
