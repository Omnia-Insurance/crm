import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getRelationIdFieldNames } from '@/object-metadata/utils/getRelationIdFieldNames';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { isUndefined } from '@sniptt/guards';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

const isManyToOneMorphRelationField = (fieldMetadataItem: FieldMetadataItem) =>
  fieldMetadataItem.type === FieldMetadataType.MORPH_RELATION &&
  fieldMetadataItem.settings?.relationType === RelationType.MANY_TO_ONE;

// The requiredCondition evaluator reads relations by field name, drafts and loaded records hold join columns
export const normalizeRequiredConditionRecord = ({
  record,
  fieldMetadataItems,
}: {
  record: Record<string, unknown>;
  fieldMetadataItems: FieldMetadataItem[];
}): Record<string, unknown> =>
  fieldMetadataItems
    .filter(
      (fieldMetadataItem) =>
        isManyToOneRelationField(fieldMetadataItem) ||
        isManyToOneMorphRelationField(fieldMetadataItem),
    )
    .reduce<Record<string, unknown>>(
      (normalizedRecord, relationFieldMetadataItem) => {
        const joinColumnNames = getRelationIdFieldNames(
          relationFieldMetadataItem,
        ).filter((joinColumnName) => joinColumnName in record);

        if (
          !isUndefined(normalizedRecord[relationFieldMetadataItem.name]) ||
          joinColumnNames.length === 0
        ) {
          return normalizedRecord;
        }

        const relatedRecordId = joinColumnNames
          .map((joinColumnName) => record[joinColumnName])
          .find(isDefined);

        return {
          ...normalizedRecord,
          [relationFieldMetadataItem.name]: isDefined(relatedRecordId)
            ? { id: relatedRecordId }
            : null,
        };
      },
      record,
    );
