import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type ObjectPermissionsByObjectMetadataId } from '@/object-metadata/types/ObjectPermissionsByObjectMetadataId';
import { getFieldMetadataItemGqlFieldName } from '@/object-metadata/utils/getFieldMetadataItemGqlFieldName';
import { getFieldPermissions } from '@/object-metadata/utils/getFieldPermissions';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { getRelationIdFieldNames } from '@/object-metadata/utils/getRelationIdFieldNames';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { type RelatedRecordRequiredConditionCheck } from '@/object-record/record-form/types/RelatedRecordRequiredConditionCheck';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isNonEmptyString } from '@sniptt/guards';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { canReachSomeRecords, isDefined } from 'twenty-shared/utils';

const isRelationFieldMetadataItem = (fieldMetadataItem: FieldMetadataItem) =>
  fieldMetadataItem.type === FieldMetadataType.RELATION ||
  fieldMetadataItem.type === FieldMetadataType.MORPH_RELATION;

// To-many relations would mean loading every linked record, so they are left to the record page
const isLoadedThroughJoinColumnsOrValue = (
  fieldMetadataItem: FieldMetadataItem,
) =>
  !isRelationFieldMetadataItem(fieldMetadataItem) ||
  isManyToOneRelationField(fieldMetadataItem) ||
  fieldMetadataItem.settings?.relationType === RelationType.MANY_TO_ONE;

export const getRelatedRecordRequiredConditionChecks = ({
  draftRecord,
  objectMetadataItem,
  objectMetadataItems,
  objectPermissionsByObjectMetadataId,
}: {
  draftRecord: Partial<ObjectRecord>;
  objectMetadataItem: EnrichedObjectMetadataItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
  objectPermissionsByObjectMetadataId: ObjectPermissionsByObjectMetadataId;
}): RelatedRecordRequiredConditionCheck[] =>
  objectMetadataItem.fields.flatMap((relationFieldMetadataItem) => {
    if (
      relationFieldMetadataItem.isActive !== true ||
      !isManyToOneRelationField(relationFieldMetadataItem)
    ) {
      return [];
    }

    const relatedRecordId =
      draftRecord[getFieldMetadataItemGqlFieldName(relationFieldMetadataItem)];

    const relatedObjectMetadataItem = objectMetadataItems.find(
      (candidate) =>
        candidate.id ===
        relationFieldMetadataItem.relation.targetObjectMetadata.id,
    );

    if (
      !isNonEmptyString(relatedRecordId) ||
      !isDefined(relatedObjectMetadataItem)
    ) {
      return [];
    }

    const relatedObjectPermissions = getObjectPermissionsForObject(
      objectPermissionsByObjectMetadataId,
      relatedObjectMetadataItem.id,
    );

    if (
      !canReachSomeRecords({
        objectRecordsPermissions: relatedObjectPermissions,
        operationType: 'read',
      })
    ) {
      return [];
    }

    const readableFieldMetadataItems = relatedObjectMetadataItem.fields.filter(
      (fieldMetadataItem) =>
        fieldMetadataItem.isActive === true &&
        isLoadedThroughJoinColumnsOrValue(fieldMetadataItem) &&
        getFieldPermissions({
          objectPermissions: relatedObjectPermissions,
          fieldMetadataId: fieldMetadataItem.id,
        }).canReadField,
    );

    const conditionFieldMetadataIds = readableFieldMetadataItems
      .map(({ requiredCondition }) =>
        isDefined(requiredCondition) && requiredCondition.type !== 'always'
          ? requiredCondition.fieldId
          : undefined,
      )
      .filter(isNonEmptyString);

    const evaluatedFieldMetadataItems = readableFieldMetadataItems.filter(
      (fieldMetadataItem) =>
        isDefined(fieldMetadataItem.requiredCondition) ||
        conditionFieldMetadataIds.includes(fieldMetadataItem.id),
    );

    if (
      !evaluatedFieldMetadataItems.some((fieldMetadataItem) =>
        isDefined(fieldMetadataItem.requiredCondition),
      )
    ) {
      return [];
    }

    return [
      {
        relationFieldMetadataItem,
        relatedObjectMetadataItem,
        relatedRecordId,
        evaluatedFieldMetadataItems,
        recordGqlFields: {
          id: true,
          ...Object.fromEntries(
            evaluatedFieldMetadataItems
              .flatMap((fieldMetadataItem) =>
                isRelationFieldMetadataItem(fieldMetadataItem)
                  ? getRelationIdFieldNames(fieldMetadataItem)
                  : [fieldMetadataItem.name],
              )
              .map((gqlFieldName) => [gqlFieldName, true]),
          ),
        },
      },
    ];
  });
