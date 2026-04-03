import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getImageIdentifierFieldMetadataItem } from '@/object-metadata/utils/getImageIdentifierFieldMetadataItem';
import { getLabelIdentifierFieldMetadataItem } from '@/object-metadata/utils/getLabelIdentifierFieldMetadataItem';
import { hasObjectMetadataItemPositionField } from '@/object-metadata/utils/hasObjectMetadataItemPositionField';
import { generateActivityTargetGqlFields } from '@/object-record/graphql/record-gql-fields/utils/generateActivityTargetGqlFields';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { generateDepthRecordGqlFieldsFromFields } from '@/object-record/graphql/record-gql-fields/utils/generateDepthRecordGqlFieldsFromFields';
import { visibleRecordFieldsComponentSelector } from '@/object-record/record-field/states/visibleRecordFieldsComponentSelector';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';

import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { filterDuplicatesById, isDefined } from 'twenty-shared/utils';

type UseRecordsUsefulGqlFields = {
  objectMetadataItem: EnrichedObjectMetadataItem;
  additionalFieldMetadataId?: string | null;
};

export const useRelevantRecordsGqlFields = ({
  objectMetadataItem,
  additionalFieldMetadataId,
}: UseRecordsUsefulGqlFields) => {
  const visibleRecordFields = useAtomComponentSelectorValue(
    visibleRecordFieldsComponentSelector,
  );

  const currentRecordFilters = useAtomComponentStateValue(
    currentRecordFiltersComponentState,
  );

  const { fieldMetadataItemByFieldMetadataItemId } =
    useRecordIndexContextOrThrow();

  const { objectMetadataItems } = useObjectMetadataItems();

  const visibleRecordFieldMetadataItems = visibleRecordFields
    .map(
      (field) =>
        fieldMetadataItemByFieldMetadataItemId[field.fieldMetadataItemId],
    )
    .filter(isDefined);

  const recordFilterFields = currentRecordFilters
    .map((recordFilter) =>
      objectMetadataItem.fields.find(
        (field) => field.id === recordFilter.fieldMetadataId,
      ),
    )
    .filter(isDefined);

  const fieldMetadataItemsToUse = [
    ...visibleRecordFieldMetadataItems,
    ...(recordFilterFields ?? []),
  ].filter(filterDuplicatesById);

  const allDepthOneGqlFields = generateDepthRecordGqlFieldsFromFields({
    objectMetadataItems,
    fields: fieldMetadataItemsToUse,
    depth: 1,
  });

  // OMNIA-CUSTOM: Merge sub-field columns into relation GQL selections.
  // When a view has sub-field columns (e.g. "Lead / Date of Birth"), we need
  // the GQL query to include those fields on the related object.
  // For sub-fields that are themselves relations (e.g. leadSource on Lead) or
  // ONE_TO_MANY (familyMembers), we must provide an object node (not just
  // `true`) so the query builder recognizes them as fetchable relations.
  for (const recordField of visibleRecordFields) {
    if (!recordField.subFieldName) continue;

    const fieldMeta =
      fieldMetadataItemByFieldMetadataItemId[recordField.fieldMetadataItemId];

    if (!isDefined(fieldMeta)) continue;

    const relationFieldName = fieldMeta.name;
    const existingRelationGql = allDepthOneGqlFields[relationFieldName];

    // Check if this sub-field is itself a relation on the target object
    const targetObjectName =
      fieldMeta.relation?.targetObjectMetadata?.nameSingular;
    const targetObject = targetObjectName
      ? objectMetadataItems.find((o) => o.nameSingular === targetObjectName)
      : undefined;
    const subFieldMeta = targetObject?.fields.find(
      (f) => f.name === recordField.subFieldName,
    );
    const isSubFieldRelation =
      subFieldMeta?.type === 'RELATION' ||
      subFieldMeta?.type === 'MORPH_RELATION';

    // MANY_TO_ONE relations need an object node `{ id, name }` so the query
    // builder recognizes them and generates a sub-selection with identifiers.
    // ONE_TO_MANY and scalars/composites work with `true` — the query builder
    // generates edges/nodes with ALL non-relation fields when recordGqlFields
    // is undefined at the nested level.
    const subFieldGqlValue: Record<string, boolean> | boolean =
      isSubFieldRelation &&
      subFieldMeta?.relation?.type !== 'ONE_TO_MANY' &&
      subFieldMeta?.settings?.relationType !== 'ONE_TO_MANY'
        ? { id: true, name: true }
        : true;

    // For MANY_TO_ONE sub-field relations, also request the join column
    // (e.g., leadSourceId) so native RelationToOneFieldDisplay can find it.
    const isManyToOne =
      isSubFieldRelation &&
      subFieldMeta?.relation?.type !== 'ONE_TO_MANY' &&
      subFieldMeta?.settings?.relationType !== 'ONE_TO_MANY';
    const joinColumnName = isManyToOne
      ? subFieldMeta?.settings?.joinColumnName ??
        `${recordField.subFieldName}Id`
      : undefined;

    if (typeof existingRelationGql === 'object' && existingRelationGql !== null) {
      (existingRelationGql as Record<string, unknown>)[recordField.subFieldName] =
        subFieldGqlValue;

      if (joinColumnName) {
        (existingRelationGql as Record<string, unknown>)[joinColumnName] = true;
      }
    } else if (existingRelationGql === true) {
      // depth=1 with full load — sub-fields already included
    } else {
      allDepthOneGqlFields[relationFieldName] = {
        id: true,
        [recordField.subFieldName]: subFieldGqlValue,
        ...(joinColumnName ? { [joinColumnName]: true } : {}),
      };
    }
  }

  const labelIdentifierFieldMetadataItem =
    getLabelIdentifierFieldMetadataItem(objectMetadataItem);
  const imageIdentifierFieldMetadataItem =
    getImageIdentifierFieldMetadataItem(objectMetadataItem);

  const hasPosition = hasObjectMetadataItemPositionField(objectMetadataItem);

  const additionalFieldMetadataItem = isDefined(additionalFieldMetadataId)
    ? fieldMetadataItemByFieldMetadataItemId[additionalFieldMetadataId]
    : undefined;

  const isObjectAnActivity =
    objectMetadataItem.nameSingular === CoreObjectNameSingular.Note ||
    objectMetadataItem.nameSingular === CoreObjectNameSingular.Task;

  return {
    id: true,
    ...(isDefined(additionalFieldMetadataItem)
      ? { [additionalFieldMetadataItem.name]: true }
      : {}),
    ...(isDefined(labelIdentifierFieldMetadataItem)
      ? { [labelIdentifierFieldMetadataItem.name]: true }
      : {}),
    ...(isDefined(imageIdentifierFieldMetadataItem)
      ? { [imageIdentifierFieldMetadataItem.name]: true }
      : {}),
    ...(hasPosition ? { position: true } : {}),
    ...allDepthOneGqlFields,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    noteTargets: generateActivityTargetGqlFields({
      activityObjectNameSingular: CoreObjectNameSingular.Note,
      objectMetadataItems,
      loadRelations: isObjectAnActivity ? 'relations' : 'activity',
    }),
    taskTargets: generateActivityTargetGqlFields({
      activityObjectNameSingular: CoreObjectNameSingular.Task,
      objectMetadataItems,
      loadRelations: isObjectAnActivity ? 'relations' : 'activity',
    }),
  };
};
