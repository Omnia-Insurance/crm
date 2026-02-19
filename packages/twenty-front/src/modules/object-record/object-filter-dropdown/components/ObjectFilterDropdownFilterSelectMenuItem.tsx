import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { FILTER_FIELD_LIST_ID } from '@/object-record/object-filter-dropdown/constants/FilterFieldListId';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { useSelectableList } from '@/ui/layout/selectable-list/hooks/useSelectableList';
import { isSelectedItemIdComponentFamilySelector } from '@/ui/layout/selectable-list/states/selectors/isSelectedItemIdComponentFamilySelector';
import { useRecoilComponentFamilyValue } from '@/ui/utilities/state/component-state/hooks/useRecoilComponentFamilyValue';
import { FieldMetadataType } from 'twenty-shared/types';
import { useIcons } from 'twenty-ui/display';
import { MenuItem } from 'twenty-ui/navigation';
import { RelationType } from '~/generated-metadata/graphql';

export type ObjectFilterDropdownFilterSelectMenuItemProps = {
  fieldMetadataItemToSelect: FieldMetadataItem;
  onClick: (selectedFieldMetadataItem: FieldMetadataItem) => void;
};

export const ObjectFilterDropdownFilterSelectMenuItem = ({
  fieldMetadataItemToSelect,
  onClick,
}: ObjectFilterDropdownFilterSelectMenuItemProps) => {
  const { resetSelectedItem } = useSelectableList(FILTER_FIELD_LIST_ID);

  const isSelectedItem = useRecoilComponentFamilyValueV2(
    isSelectedItemIdComponentFamilyState,
    fieldMetadataItemToSelect.id,
  );

  const { getIcon } = useIcons();

  const Icon = getIcon(fieldMetadataItemToSelect.icon);

  const shouldShowSubMenu =
    isCompositeFieldType(fieldMetadataItemToSelect.type) ||
    (fieldMetadataItemToSelect.type === FieldMetadataType.RELATION &&
      fieldMetadataItemToSelect.relation?.type === RelationType.ONE_TO_MANY);

  const handleClick = () => {
    resetSelectedItem();

    onClick(fieldMetadataItemToSelect);
  };

  return (
    <MenuItem
      focused={isSelectedItem}
      onClick={handleClick}
      LeftIcon={Icon}
      text={fieldMetadataItemToSelect.label}
      hasSubMenu={shouldShowSubMenu}
    />
  );
};
