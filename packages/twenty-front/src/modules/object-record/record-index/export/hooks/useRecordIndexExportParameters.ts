import { contextStoreAnyFieldFilterValueComponentState } from '@/context-store/states/contextStoreAnyFieldFilterValueComponentState';
import { contextStoreFilterGroupsComponentState } from '@/context-store/states/contextStoreFilterGroupsComponentState';
import { contextStoreFiltersComponentState } from '@/context-store/states/contextStoreFiltersComponentState';
import { contextStoreTargetedRecordsRuleComponentState } from '@/context-store/states/contextStoreTargetedRecordsRuleComponentState';
import { computeContextStoreFilters } from '@/context-store/utils/computeContextStoreFilters';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { flattenedFieldMetadataItemsSelector } from '@/object-metadata/states/flattenedFieldMetadataItemsSelector';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useObjectOptionsForBoard } from '@/object-record/object-options-dropdown/hooks/useObjectOptionsForBoard';
import { visibleRecordFieldsComponentSelector } from '@/object-record/record-field/states/visibleRecordFieldsComponentSelector';
import { useFilterValueDependencies } from '@/object-record/record-filter/hooks/useFilterValueDependencies';
import { useFindManyRecordIndexTableParams } from '@/object-record/record-index/hooks/useFindManyRecordIndexTableParams';
import { recordIndexGroupFieldMetadataItemComponentState } from '@/object-record/record-index/states/recordIndexGroupFieldMetadataComponentState';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { ViewType } from '@/views/types/ViewType';
import { isOneToManyBackReferenceSubField } from '@/views/utils/isOneToManyBackReferenceSubField';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import {
  type RecordExportRelationSubFieldInput,
  RelationType,
} from '~/generated-metadata/graphql';

export const useRecordIndexExportParameters = ({
  objectMetadataItem,
  recordIndexId,
  viewType = ViewType.TABLE,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  recordIndexId: string;
  viewType?: ViewType;
}) => {
  const { hiddenBoardFields } = useObjectOptionsForBoard({
    objectNameSingular: objectMetadataItem.nameSingular,
    recordBoardId: recordIndexId,
    viewBarId: recordIndexId,
  });

  const recordIndexGroupFieldMetadataItem = useAtomComponentStateValue(
    recordIndexGroupFieldMetadataItemComponentState,
    recordIndexId,
  );

  const hiddenKanbanFieldColumn = hiddenBoardFields.find(
    (column) =>
      column.metadata.fieldName === recordIndexGroupFieldMetadataItem?.name,
  );

  const contextStoreTargetedRecordsRule = useAtomComponentStateValue(
    contextStoreTargetedRecordsRuleComponentState,
  );

  const contextStoreFilters = useAtomComponentStateValue(
    contextStoreFiltersComponentState,
  );

  const contextStoreFilterGroups = useAtomComponentStateValue(
    contextStoreFilterGroupsComponentState,
  );

  const contextStoreAnyFieldFilterValue = useAtomComponentStateValue(
    contextStoreAnyFieldFilterValueComponentState,
  );

  const { filterValueDependencies } = useFilterValueDependencies();

  const flattenedFieldMetadataItems = useAtomStateValue(
    flattenedFieldMetadataItemsSelector,
  );

  const findManyRecordsParams = useFindManyRecordIndexTableParams(
    objectMetadataItem.nameSingular,
    recordIndexId,
  );

  const isEmptySelection =
    contextStoreTargetedRecordsRule.mode === 'selection' &&
    contextStoreTargetedRecordsRule.selectedRecordIds.length === 0;

  const contextStoreFilter = computeContextStoreFilters({
    contextStoreTargetedRecordsRule,
    contextStoreFilters,
    contextStoreFilterGroups,
    objectMetadataItem,
    fieldMetadataItems: flattenedFieldMetadataItems,
    filterValueDependencies,
    contextStoreAnyFieldFilterValue,
  });

  const queryFilter = isEmptySelection
    ? findManyRecordsParams.filter
    : contextStoreFilter;

  const visibleRecordFields = useAtomComponentSelectorValue(
    visibleRecordFieldsComponentSelector,
    recordIndexId,
  );

  // OMNIA-CUSTOM: a relation sub-field column ("Lead / Date of Birth", contract C6) goes in
  // relationSubFields and sends its relation id once, at the relation's first column, where the
  // server lays out that relation's "<Rel> / Id, <Rel> / <Label>, <Rel> / <Sub>" group
  const { objectMetadataItems } = useObjectMetadataItems();
  const fieldMetadataIds: string[] = [];
  const relationSubFields: RecordExportRelationSubFieldInput[] = [];

  for (const recordField of visibleRecordFields) {
    const fieldMetadataItem = objectMetadataItem.fields.find(
      (field) => field.id === recordField.fieldMetadataItemId,
    );

    if (!isDefined(fieldMetadataItem)) {
      continue;
    }

    const { subFieldName } = recordField;

    if (isNonEmptyString(subFieldName)) {
      const { relation } = fieldMetadataItem;
      const subFieldMetadataItem =
        relation?.type === RelationType.MANY_TO_ONE
          ? objectMetadataItems
              .find((item) => item.id === relation.targetObjectMetadata.id)
              ?.fields.find(
                (field) => field.name === subFieldName && field.isActive,
              )
          : undefined;

      // The server exports active fields of a to-one relation only, and a one-to-many list of the
      // exported object's own records would repeat every sibling in every row (2026-08-22 worker OOM)
      if (
        !isDefined(subFieldMetadataItem) ||
        isOneToManyBackReferenceSubField({
          subFieldMetadataItem,
          baseObjectNameSingular: objectMetadataItem.nameSingular,
        })
      ) {
        continue;
      }

      if (
        !relationSubFields.some(
          (relationSubField) =>
            relationSubField.fieldMetadataId === fieldMetadataItem.id &&
            relationSubField.subFieldName === subFieldName,
        )
      ) {
        relationSubFields.push({
          fieldMetadataId: fieldMetadataItem.id,
          subFieldName,
        });
      }
    }

    if (!fieldMetadataIds.includes(fieldMetadataItem.id)) {
      fieldMetadataIds.push(fieldMetadataItem.id);
    }
  }

  const hiddenKanbanFieldMetadataId =
    viewType === ViewType.KANBAN
      ? objectMetadataItem.fields.find(
          (field) => field.name === hiddenKanbanFieldColumn?.metadata.fieldName,
        )?.id
      : undefined;

  if (
    isDefined(hiddenKanbanFieldMetadataId) &&
    !fieldMetadataIds.includes(hiddenKanbanFieldMetadataId)
  ) {
    fieldMetadataIds.push(hiddenKanbanFieldMetadataId);
  }

  return {
    objectMetadataId: objectMetadataItem.id,
    filter: queryFilter,
    orderBy: findManyRecordsParams.orderBy,
    fieldMetadataIds,
    relationSubFields,
  };
};
