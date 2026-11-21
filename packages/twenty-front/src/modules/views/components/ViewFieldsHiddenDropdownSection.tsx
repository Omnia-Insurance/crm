import { ApplicationStackIcon } from '@/applications/components/ApplicationStackIcon';
import { useActiveFieldMetadataItems } from '@/object-metadata/hooks/useActiveFieldMetadataItems';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { useObjectOptionsForBoard } from '@/object-record/object-options-dropdown/hooks/useObjectOptionsForBoard';
import { ObjectOptionsDropdownContext } from '@/object-record/object-options-dropdown/states/contexts/ObjectOptionsDropdownContext';
import { objectOptionsDropdownExpandedRelationFieldIdComponentState } from '@/object-record/object-options-dropdown/states/objectOptionsDropdownExpandedRelationFieldIdComponentState';
import { useChangeRecordFieldVisibility } from '@/object-record/record-field/hooks/useChangeRecordFieldVisibility';
import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { ViewType } from '@/views/types/ViewType';
import { useContext } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { LightIconButton } from 'twenty-ui/components/input';
import { ListItemButton } from 'twenty-ui/components/navigation';
import { IconChevronRight, IconEye } from 'twenty-ui/icon';
import { useIcons } from 'twenty-ui/icon/provider';
import { ListItem } from 'twenty-ui/primitives/navigation';
import { useLingui } from '@lingui/react/macro';

export const ViewFieldsHiddenDropdownSection = () => {
  const { t } = useLingui();
  const { viewType, objectMetadataItem, recordIndexId, onContentChange } =
    useContext(ObjectOptionsDropdownContext);

  const { changeRecordFieldVisibility } =
    useChangeRecordFieldVisibility(recordIndexId);

  const { handleBoardFieldVisibilityChange } = useObjectOptionsForBoard({
    objectNameSingular: objectMetadataItem.nameSingular,
    recordBoardId: recordIndexId,
    viewBarId: recordIndexId,
  });

  const handleChangeFieldVisibility =
    viewType === ViewType.KANBAN
      ? handleBoardFieldVisibilityChange
      : changeRecordFieldVisibility;

  const currentRecordFields = useAtomComponentStateValue(
    currentRecordFieldsComponentState,
  );

  // OMNIA-CUSTOM: a sub-field column ("Lead / Date of Birth") shares its relation's fieldMetadataItemId, so only a
  // plain column takes a field off the hidden list
  const visibleRecordFields = currentRecordFields.filter(
    (recordFieldToFilter) =>
      recordFieldToFilter.isVisible === true &&
      !isDefined(recordFieldToFilter.subFieldName),
  );

  const { activeFieldMetadataItems } = useActiveFieldMetadataItems({
    objectMetadataItem,
  });

  const availableFieldMetadataItemsToShow = activeFieldMetadataItems.filter(
    (fieldMetadataItemToFilter) =>
      !visibleRecordFields
        .map((recordField) => recordField.fieldMetadataItemId)
        .includes(fieldMetadataItemToFilter.id),
  );

  const { getIcon } = useIcons();

  // OMNIA-CUSTOM: many-to-one relations open the relationSubFields page to add target fields as columns. Table
  // views only: board, calendar and list cards render visible fields by field id and cannot show a sub-field
  const canAddRelationSubFields = viewType === ViewType.TABLE;

  const setObjectOptionsDropdownExpandedRelationFieldId =
    useSetAtomComponentState(
      objectOptionsDropdownExpandedRelationFieldIdComponentState,
    );

  const handleShowRelationSubFields = (relationFieldMetadataItemId: string) => {
    setObjectOptionsDropdownExpandedRelationFieldId(
      relationFieldMetadataItemId,
    );
    onContentChange('relationSubFields');
  };

  const visibleRelationFieldMetadataItems = canAddRelationSubFields
    ? activeFieldMetadataItems.filter(
        (fieldMetadataItem) =>
          isManyToOneRelationField(fieldMetadataItem) &&
          visibleRecordFields.some(
            (recordField) =>
              recordField.fieldMetadataItemId === fieldMetadataItem.id,
          ),
      )
    : [];

  return (
    <>
      <DropdownMenuItemsContainer>
        {/* OMNIA-CUSTOM: visible relations, to add their sub-field columns */}
        {visibleRelationFieldMetadataItems.map((fieldMetadataItem) => {
          const relationFieldLabel = fieldMetadataItem.label;

          return (
            <ListItemButton
              key={`relation-sub-fields-${fieldMetadataItem.id}`}
              startIcon={
                <ApplicationStackIcon
                  Icon={getIcon(fieldMetadataItem.icon)}
                  applicationId={fieldMetadataItem.applicationId}
                />
              }
              onClick={() => handleShowRelationSubFields(fieldMetadataItem.id)}
              hasSubmenu
            >{t`${relationFieldLabel} fields`}</ListItemButton>
          );
        })}
        {availableFieldMetadataItemsToShow.length > 0 &&
          availableFieldMetadataItemsToShow.map((fieldMetadataItem) => {
            return (
              <ListItem
                key={fieldMetadataItem.id}
                startIcon={
                  <ApplicationStackIcon
                    Icon={getIcon(fieldMetadataItem.icon)}
                    applicationId={fieldMetadataItem.applicationId}
                  />
                }
                actions={
                  <>
                    <LightIconButton
                      aria-label={t`Show field`}
                      onClick={() =>
                        handleChangeFieldVisibility({
                          fieldMetadataId: fieldMetadataItem.id,
                          isVisible: true,
                        })
                      }
                    >
                      <IconEye />
                    </LightIconButton>
                    {/* OMNIA-CUSTOM: opens the relationSubFields page */}
                    {canAddRelationSubFields &&
                      isManyToOneRelationField(fieldMetadataItem) && (
                        <LightIconButton
                          aria-label={t`Show relation fields`}
                          onClick={() =>
                            handleShowRelationSubFields(fieldMetadataItem.id)
                          }
                        >
                          <IconChevronRight />
                        </LightIconButton>
                      )}
                  </>
                }
              >
                {fieldMetadataItem.label}
              </ListItem>
            );
          })}
      </DropdownMenuItemsContainer>
    </>
  );
};
