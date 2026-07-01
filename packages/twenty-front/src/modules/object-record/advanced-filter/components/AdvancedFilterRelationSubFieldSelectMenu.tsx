import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useAdvancedFilterFieldSelectDropdown } from '@/object-record/advanced-filter/hooks/useAdvancedFilterFieldSelectDropdown';
import { useApplyAdvancedFilterRelationSubField } from '@/object-record/advanced-filter/hooks/useApplyAdvancedFilterRelationSubField';
import { usePushFocusForLeafFieldValuePicker } from '@/object-record/advanced-filter/hooks/usePushFocusForLeafFieldValuePicker';
import { fieldMetadataItemUsedInDropdownComponentSelector } from '@/object-record/object-filter-dropdown/states/fieldMetadataItemUsedInDropdownComponentSelector';
import { objectFilterDropdownIsSelectingRelationSubFieldComponentState } from '@/object-record/object-filter-dropdown/states/objectFilterDropdownIsSelectingRelationSubFieldComponentState';
import { useFilterableFieldMetadataItems } from '@/object-record/record-filter/hooks/useFilterableFieldMetadataItems';
import { RecordFilterOperand } from '@/object-record/record-filter/types/RecordFilterOperand';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuHeader } from '@/ui/layout/dropdown/components/DropdownMenuHeader/DropdownMenuHeader';
import { DropdownMenuHeaderLeftComponent } from '@/ui/layout/dropdown/components/DropdownMenuHeader/internal/DropdownMenuHeaderLeftComponent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { GenericDropdownContentWidth } from '@/ui/layout/dropdown/constants/GenericDropdownContentWidth';
import { SelectableList } from '@/ui/layout/selectable-list/components/SelectableList';
import { SelectableListItem } from '@/ui/layout/selectable-list/components/SelectableListItem';
import { selectedItemIdComponentState } from '@/ui/layout/selectable-list/states/selectedItemIdComponentState';
import { useAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentState';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { t } from '@lingui/core/macro';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import {
  IconChevronLeft,
  IconFilterOff,
  IconFilterPlus,
  useIcons,
} from 'twenty-ui/icon';
import { MenuItem } from 'twenty-ui/navigation';

type AdvancedFilterRelationSubFieldSelectMenuProps = {
  recordFilterId: string;
};

export const AdvancedFilterRelationSubFieldSelectMenu = ({
  recordFilterId,
}: AdvancedFilterRelationSubFieldSelectMenuProps) => {
  const { getIcon } = useIcons();

  const fieldMetadataItemUsedInDropdown = useAtomComponentSelectorValue(
    fieldMetadataItemUsedInDropdownComponentSelector,
  );

  const [, setObjectFilterDropdownIsSelectingRelationSubField] =
    useAtomComponentState(
      objectFilterDropdownIsSelectingRelationSubFieldComponentState,
    );

  const {
    closeAdvancedFilterFieldSelectDropdown,
    advancedFilterFieldSelectDropdownId,
  } = useAdvancedFilterFieldSelectDropdown(recordFilterId);

  const { applyAdvancedFilterRelationSubField } =
    useApplyAdvancedFilterRelationSubField();

  const { pushFocusForLeafFieldValuePicker } =
    usePushFocusForLeafFieldValuePicker();

  const { objectMetadataItems } = useObjectMetadataItems();

  const targetObjectMetadataId =
    fieldMetadataItemUsedInDropdown?.relation?.targetObjectMetadata.id;

  const { filterableFieldMetadataItems } = useFilterableFieldMetadataItems(
    targetObjectMetadataId ?? '',
  );

  const targetObjectMetadataItem = objectMetadataItems.find(
    (item) => item.id === targetObjectMetadataId,
  );

  // Filter to only simple field types (exclude RELATION and composite types)
  const simpleFilterableFields = filterableFieldMetadataItems.filter(
    (field) =>
      field.type !== FieldMetadataType.RELATION &&
      field.type !== FieldMetadataType.MORPH_RELATION,
  );

  const handleSubMenuBack = () => {
    setObjectFilterDropdownIsSelectingRelationSubField(false);
  };

  const handleSelectRelationOperand = (
    relationOperand:
      | RecordFilterOperand.IS_EMPTY
      | RecordFilterOperand.IS_NOT_EMPTY,
  ) => {
    if (!isDefined(fieldMetadataItemUsedInDropdown)) {
      return;
    }

    applyAdvancedFilterRelationSubField({
      sourceFieldMetadataItem: fieldMetadataItemUsedInDropdown,
      recordFilterId,
      relationOperand,
    });

    closeAdvancedFilterFieldSelectDropdown();
  };

  const handleSelectSubField = (targetFieldId: string) => {
    if (!isDefined(fieldMetadataItemUsedInDropdown)) {
      return;
    }

    const relationTargetFieldMetadataItem = simpleFilterableFields.find(
      (field) => field.id === targetFieldId,
    );

    if (!isDefined(relationTargetFieldMetadataItem)) {
      return;
    }

    applyAdvancedFilterRelationSubField({
      sourceFieldMetadataItem: fieldMetadataItemUsedInDropdown,
      recordFilterId,
      relationTargetFieldMetadataItem,
    });

    pushFocusForLeafFieldValuePicker(relationTargetFieldMetadataItem);
    closeAdvancedFilterFieldSelectDropdown();
  };

  const selectedItemId = useAtomComponentStateValue(
    selectedItemIdComponentState,
    advancedFilterFieldSelectDropdownId,
  );

  if (!isDefined(fieldMetadataItemUsedInDropdown)) {
    return null;
  }

  const selectableItemIdArray = [
    'has-any',
    'has-none',
    ...simpleFilterableFields.map((field) => field.id),
  ];

  return (
    <DropdownContent widthInPixels={GenericDropdownContentWidth.ExtraLarge}>
      <DropdownMenuHeader
        StartComponent={
          <DropdownMenuHeaderLeftComponent
            onClick={handleSubMenuBack}
            Icon={IconChevronLeft}
          />
        }
      >
        {fieldMetadataItemUsedInDropdown.label}
      </DropdownMenuHeader>
      <DropdownMenuItemsContainer>
        <SelectableList
          focusId={advancedFilterFieldSelectDropdownId}
          selectableItemIdArray={selectableItemIdArray}
          selectableListInstanceId={advancedFilterFieldSelectDropdownId}
        >
          <SelectableListItem
            itemId="has-any"
            key="select-filter-has-any"
            onEnter={() =>
              handleSelectRelationOperand(RecordFilterOperand.IS_NOT_EMPTY)
            }
          >
            <MenuItem
              focused={selectedItemId === 'has-any'}
              onClick={() =>
                handleSelectRelationOperand(RecordFilterOperand.IS_NOT_EMPTY)
              }
              LeftIcon={IconFilterPlus}
              text={t`Has any ${targetObjectMetadataItem?.labelPlural ?? ''}`}
            />
          </SelectableListItem>
          <SelectableListItem
            itemId="has-none"
            key="select-filter-has-none"
            onEnter={() =>
              handleSelectRelationOperand(RecordFilterOperand.IS_EMPTY)
            }
          >
            <MenuItem
              focused={selectedItemId === 'has-none'}
              onClick={() =>
                handleSelectRelationOperand(RecordFilterOperand.IS_EMPTY)
              }
              LeftIcon={IconFilterOff}
              text={t`Has no ${targetObjectMetadataItem?.labelPlural ?? ''}`}
            />
          </SelectableListItem>
          {simpleFilterableFields.map((field, index) => (
            <SelectableListItem
              itemId={field.id}
              key={`select-filter-${index}`}
              onEnter={() => handleSelectSubField(field.id)}
            >
              <MenuItem
                focused={selectedItemId === field.id}
                onClick={() => handleSelectSubField(field.id)}
                LeftIcon={getIcon(field.icon)}
                text={field.label}
              />
            </SelectableListItem>
          ))}
        </SelectableList>
      </DropdownMenuItemsContainer>
    </DropdownContent>
  );
};
