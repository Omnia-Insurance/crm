import { DraggableListRow } from '@/ui/layout/draggable-list/components/DraggableListRow';
import { ApplicationStackIcon } from '@/applications/components/ApplicationStackIcon';
import { useGetFieldMetadataItemByIdOrThrow } from '@/object-metadata/hooks/useGetFieldMetadataItemById';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { getLabelIdentifierFieldMetadataItem } from '@/object-metadata/utils/getLabelIdentifierFieldMetadataItem';
import { useObjectOptionsForBoard } from '@/object-record/object-options-dropdown/hooks/useObjectOptionsForBoard';
import { useProcessOptionDropdownDragEnd } from '@/object-record/object-options-dropdown/hooks/useProcessOptionDropdownDragEnd';
import { ObjectOptionsDropdownContext } from '@/object-record/object-options-dropdown/states/contexts/ObjectOptionsDropdownContext';
import { useChangeRecordFieldVisibility } from '@/object-record/record-field/hooks/useChangeRecordFieldVisibility';
import { visibleRecordFieldsComponentSelector } from '@/object-record/record-field/states/visibleRecordFieldsComponentSelector';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { getRecordFieldColumnKey } from '@/object-record/record-field/utils/getRecordFieldColumnKey';
import { getRelationSubFieldMetadataItem } from '@/object-record/record-field/utils/getRelationSubFieldMetadataItem';
import { DraggableItem } from '@/ui/layout/draggable-list/components/DraggableItem';
import { DraggableList } from '@/ui/layout/draggable-list/components/DraggableList';
import { type DraggableListDropResult } from '@/ui/layout/draggable-list/types/DraggableListDropResult';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { ViewType } from '@/views/types/ViewType';
import { getRelationSubFieldColumnLabel } from '@/views/utils/getRelationSubFieldColumnLabel';
import { isNonEmptyString } from '@sniptt/guards';
import { useContext } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { LightIconButton } from 'twenty-ui/components/input';
import { IconEyeOff } from 'twenty-ui/icon';
import { useIcons } from 'twenty-ui/icon/provider';
import { sortByProperty } from '~/utils/array/sortByProperty';
import { useLingui } from '@lingui/react/macro';

export const ViewFieldsVisibleDropdownSection = () => {
  const { t } = useLingui();
  const { viewType, objectMetadataItem, recordIndexId } = useContext(
    ObjectOptionsDropdownContext,
  );

  const { processOptionDropdownDragEnd } =
    useProcessOptionDropdownDragEnd(recordIndexId);

  const { handleReorderBoardFields, handleBoardFieldVisibilityChange } =
    useObjectOptionsForBoard({
      objectNameSingular: objectMetadataItem.nameSingular,
      recordBoardId: recordIndexId,
      viewBarId: recordIndexId,
    });

  const { getFieldMetadataItemByIdOrThrow } =
    useGetFieldMetadataItemByIdOrThrow();

  const handleReorderFields =
    viewType === ViewType.KANBAN
      ? handleReorderBoardFields
      : processOptionDropdownDragEnd;

  const { changeRecordFieldVisibility } =
    useChangeRecordFieldVisibility(recordIndexId);

  const handleChangeFieldVisibility =
    viewType === ViewType.KANBAN
      ? handleBoardFieldVisibilityChange
      : changeRecordFieldVisibility;

  const { getIcon } = useIcons();
  const { objectMetadataItems } = useObjectMetadataItems();

  const fieldMetadataItemLabelIdentifier =
    getLabelIdentifierFieldMetadataItem(objectMetadataItem);

  const visibleRecordFields = useAtomComponentSelectorValue(
    visibleRecordFieldsComponentSelector,
  );

  const nonDraggableRecordField = visibleRecordFields.find(
    (recordFieldToFilter) =>
      recordFieldToFilter.fieldMetadataItemId ===
      fieldMetadataItemLabelIdentifier?.id,
  );

  const draggableRecordFields = visibleRecordFields
    .filter(
      (recordFieldToFilter) =>
        nonDraggableRecordField?.fieldMetadataItemId !==
        recordFieldToFilter.fieldMetadataItemId,
    )
    .toSorted(sortByProperty('position'));

  const handleDragEnd = (result: DraggableListDropResult) => {
    if (!isDefined(result.destination)) {
      return;
    }

    const recordFieldToMove = draggableRecordFields[result.source.index];

    // OMNIA-CUSTOM: the board handlers find a field by fieldMetadataItemId, which a sub-field column shares with
    // its relation, so a sub-field column (kept when a table view becomes a board) always uses the record-field hooks
    const handleReorderRecordField = isNonEmptyString(
      recordFieldToMove.subFieldName,
    )
      ? processOptionDropdownDragEnd
      : handleReorderFields;

    handleReorderRecordField({
      recordFieldToMove,
      targetRecordField: draggableRecordFields[result.destination.index],
    });
  };

  // OMNIA-CUSTOM: a sub-field column is hidden by its (field, sub-field) pair, for the same reason
  const handleHideRecordField = (recordField: RecordField) => {
    if (isNonEmptyString(recordField.subFieldName)) {
      changeRecordFieldVisibility({
        fieldMetadataId: recordField.fieldMetadataItemId,
        isVisible: false,
        subFieldName: recordField.subFieldName,
      });

      return;
    }

    handleChangeFieldVisibility({
      fieldMetadataId: recordField.fieldMetadataItemId,
      isVisible: false,
    });
  };

  return (
    <>
      <DropdownMenuItemsContainer>
        {fieldMetadataItemLabelIdentifier && (
          <DraggableListRow
            startIcon={
              <ApplicationStackIcon
                Icon={getIcon(fieldMetadataItemLabelIdentifier.icon)}
                applicationId={fieldMetadataItemLabelIdentifier.applicationId}
              />
            }
            isMuted
            dragHandleVisibility="always"
            isDragDisabled
          >
            {fieldMetadataItemLabelIdentifier.label}
          </DraggableListRow>
        )}
        {draggableRecordFields.length > 0 && (
          <DraggableList
            onDragEnd={handleDragEnd}
            draggableItems={
              <>
                {draggableRecordFields.map((recordField, index) => {
                  const { fieldMetadataItem } = getFieldMetadataItemByIdOrThrow(
                    recordField.fieldMetadataItemId,
                  );

                  // OMNIA-CUSTOM: sub-field columns share fieldMetadataItemId with their relation, so they are keyed
                  // by column key and labelled "Lead / Date of Birth" like the table header
                  const columnKey = getRecordFieldColumnKey(recordField);
                  const { subFieldName } = recordField;
                  const subFieldMetadataItem = isNonEmptyString(subFieldName)
                    ? getRelationSubFieldMetadataItem({
                        targetObjectMetadataId:
                          fieldMetadataItem.relation?.targetObjectMetadata.id,
                        subFieldName,
                        objectMetadataItems,
                      })
                    : null;
                  const fieldLabel = isNonEmptyString(subFieldName)
                    ? getRelationSubFieldColumnLabel({
                        relationFieldLabel: fieldMetadataItem.label,
                        subFieldLabel:
                          subFieldMetadataItem?.label ?? subFieldName,
                      })
                    : fieldMetadataItem.label;
                  const fieldIconMetadataItem =
                    subFieldMetadataItem ?? fieldMetadataItem;

                  return (
                    <DraggableItem
                      key={columnKey}
                      draggableId={columnKey}
                      index={index}
                      itemComponent={
                        <DraggableListRow
                          key={columnKey}
                          startIcon={
                            <ApplicationStackIcon
                              Icon={getIcon(fieldIconMetadataItem.icon)}
                              applicationId={
                                fieldIconMetadataItem.applicationId
                              }
                            />
                          }
                          actions={
                            <LightIconButton
                              aria-label={t`Hide field`}
                              onClick={() => handleHideRecordField(recordField)}
                            >
                              <IconEyeOff />
                            </LightIconButton>
                          }
                          dragHandleVisibility="always"
                        >
                          {fieldLabel}
                        </DraggableListRow>
                      }
                    />
                  );
                })}
              </>
            }
          />
        )}
      </DropdownMenuItemsContainer>
    </>
  );
};
