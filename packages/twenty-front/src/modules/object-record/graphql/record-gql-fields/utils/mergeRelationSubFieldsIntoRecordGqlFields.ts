import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { buildIdentifierGqlFields } from '@/object-record/graphql/record-gql-fields/utils/buildIdentifierGqlFields';
import { isRecordGqlFieldsNode } from '@/object-record/graphql/utils/isRecordGraphlFieldsNode';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { getRelationSubFieldMetadataItem } from '@/object-record/record-field/utils/getRelationSubFieldMetadataItem';
import { isNonEmptyString } from '@sniptt/guards';
import { type RecordGqlFields } from 'twenty-shared/types';
import {
  computeRelationGqlFieldJoinColumnName,
  findById,
  isDefined,
} from 'twenty-shared/utils';

type MergeRelationSubFieldsIntoRecordGqlFieldsArgs = {
  recordGqlFields: RecordGqlFields;
  recordFields: Pick<RecordField, 'fieldMetadataItemId' | 'subFieldName'>[];
  fieldMetadataItemByFieldMetadataItemId: Record<string, FieldMetadataItem>;
  objectMetadataItems: EnrichedObjectMetadataItem[];
};

const buildSubFieldRecordGqlFields = ({
  subFieldMetadataItem,
  objectMetadataItems,
}: {
  subFieldMetadataItem: FieldMetadataItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
}): RecordGqlFields => {
  if (!isManyToOneRelationField(subFieldMetadataItem)) {
    return { [subFieldMetadataItem.name]: true };
  }

  const subFieldTargetObjectMetadataItem = objectMetadataItems.find(
    findById(subFieldMetadataItem.relation.targetObjectMetadata.id),
  );

  if (!isDefined(subFieldTargetObjectMetadataItem)) {
    return {};
  }

  // The join column lets the display tell an empty relation from one the role cannot read
  return {
    [subFieldMetadataItem.name]: buildIdentifierGqlFields(
      subFieldTargetObjectMetadataItem,
    ),
    [computeRelationGqlFieldJoinColumnName({
      name: subFieldMetadataItem.name,
    })]: true,
  };
};

// Feeds relation sub-field columns such as "Lead / Date of Birth". The result must still go through
// mapObjectMetadataToGraphQLQuery, which drops the fields and objects the role cannot read
export const mergeRelationSubFieldsIntoRecordGqlFields = ({
  recordGqlFields,
  recordFields,
  fieldMetadataItemByFieldMetadataItemId,
  objectMetadataItems,
}: MergeRelationSubFieldsIntoRecordGqlFieldsArgs): RecordGqlFields =>
  recordFields.reduce<RecordGqlFields>(
    (mergedRecordGqlFields, { fieldMetadataItemId, subFieldName }) => {
      if (!isNonEmptyString(subFieldName)) {
        return mergedRecordGqlFields;
      }

      const relationFieldMetadataItem =
        fieldMetadataItemByFieldMetadataItemId[fieldMetadataItemId];

      if (
        !isDefined(relationFieldMetadataItem) ||
        !isManyToOneRelationField(relationFieldMetadataItem)
      ) {
        return mergedRecordGqlFields;
      }

      const relationRecordGqlFields =
        mergedRecordGqlFields[relationFieldMetadataItem.name];

      // `true` already selects every readable scalar field of the related record; a node would narrow it
      if (relationRecordGqlFields === true) {
        return mergedRecordGqlFields;
      }

      const targetObjectMetadataId =
        relationFieldMetadataItem.relation.targetObjectMetadata.id;

      const targetObjectMetadataItem = objectMetadataItems.find(
        findById(targetObjectMetadataId),
      );

      const subFieldMetadataItem = getRelationSubFieldMetadataItem({
        targetObjectMetadataId,
        subFieldName,
        objectMetadataItems,
      });

      if (
        !isDefined(targetObjectMetadataItem) ||
        !isDefined(subFieldMetadataItem)
      ) {
        return mergedRecordGqlFields;
      }

      return {
        ...mergedRecordGqlFields,
        [relationFieldMetadataItem.name]: {
          ...(isRecordGqlFieldsNode(relationRecordGqlFields)
            ? relationRecordGqlFields
            : buildIdentifierGqlFields(targetObjectMetadataItem)),
          ...buildSubFieldRecordGqlFields({
            subFieldMetadataItem,
            objectMetadataItems,
          }),
        },
      };
    },
    recordGqlFields,
  );
