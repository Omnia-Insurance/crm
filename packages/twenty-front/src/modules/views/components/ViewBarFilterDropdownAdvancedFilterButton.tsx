import { useObjectMetadataItemById } from '@/object-metadata/hooks/useObjectMetadataItemById';
import { availableFieldMetadataItemsForFilterFamilySelector } from '@/object-metadata/states/availableFieldMetadataItemsForFilterFamilySelector';
import { useUpsertRecordFilterGroup } from '@/object-record/record-filter-group/hooks/useUpsertRecordFilterGroup';
import { currentRecordFilterGroupsComponentState } from '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState';
import { useUpsertRecordFilter } from '@/object-record/record-filter/hooks/useUpsertRecordFilter';
import { SelectableListItem } from '@/ui/layout/selectable-list/components/SelectableListItem';
import { isSelectedItemIdComponentFamilyState } from '@/ui/layout/selectable-list/states/isSelectedItemIdComponentFamilyState';
import { useAtomComponentFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateValue';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { VIEW_BAR_FILTER_BOTTOM_MENU_ITEM_IDS } from '@/views/constants/ViewBarFilterBottomMenuItemIds';

import { useChildRecordFiltersAndRecordFilterGroups } from '@/object-record/advanced-filter/hooks/useChildRecordFiltersAndRecordFilterGroups';
import { useSetRecordFilterUsedInAdvancedFilterDropdownRow } from '@/object-record/advanced-filter/hooks/useSetRecordFilterUsedInAdvancedFilterDropdownRow';
import { rootLevelRecordFilterGroupComponentSelector } from '@/object-record/advanced-filter/states/rootLevelRecordFilterGroupComponentSelector';
import { useCreateEmptyRecordFilterFromFieldMetadataItem } from '@/object-record/record-filter/hooks/useCreateEmptyRecordFilterFromFieldMetadataItem';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { useOpenDropdown } from '@/ui/layout/dropdown/hooks/useOpenDropdown';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { ViewBarFilterDropdownIds } from '@/views/constants/ViewBarFilterDropdownIds';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type View } from '@/views/types/View';
import { RecordFilterGroupLogicalOperator } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Pill } from 'twenty-ui/data-display';
import { IconFilter } from 'twenty-ui/icon';
import { MenuItem } from 'twenty-ui/navigation';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { v4 } from 'uuid';

const StyledPillContainer = styled.span`
  & > * {
    background: ${themeCssVariables.color.blue3};
    color: ${themeCssVariables.color.blue};
  }
`;

export const ViewBarFilterDropdownAdvancedFilterButton = () => {
  const { currentView } = useGetCurrentViewOnly();

  // OMNIA-CUSTOM: Gracefully hide the advanced filter affordance when no
  // current view is bound (e.g. when reusing this filter UI outside the
  // RecordIndex, like our reconciliation review page). Advanced filter groups
  // are persisted on a view, so without one this button cannot do anything.
  if (!currentView?.objectMetadataId) {
    return null;
  }

  return (
    <ViewBarFilterDropdownAdvancedFilterButtonInner currentView={currentView} />
  );
};

const ViewBarFilterDropdownAdvancedFilterButtonInner = ({
  currentView,
}: {
  currentView: View;
}) => {
  const rootRecordFilterGroup = useAtomComponentSelectorValue(
    rootLevelRecordFilterGroupComponentSelector,
  );

  const { childRecordFiltersAndRecordFilterGroups } =
    useChildRecordFiltersAndRecordFilterGroups({
      recordFilterGroupId: rootRecordFilterGroup?.id,
    });

  const advancedFilterQuerySubFilterCount =
    childRecordFiltersAndRecordFilterGroups.length;

  const { t } = useLingui();

  const isSelectedItemId = useAtomComponentFamilyStateValue(
    isSelectedItemIdComponentFamilyState,
    VIEW_BAR_FILTER_BOTTOM_MENU_ITEM_IDS.ADVANCED_FILTER,
  );

  const { openDropdown: openAdvancedFilterDropdown } = useOpenDropdown();

  const { closeDropdown: closeObjectFilterDropdown } = useCloseDropdown();

  const { upsertRecordFilterGroup } = useUpsertRecordFilterGroup();

  const { upsertRecordFilter } = useUpsertRecordFilter();

  const { objectMetadataItem } = useObjectMetadataItemById({
    objectId: currentView.objectMetadataId,
  });

  const availableFieldMetadataItemsForFilter = useAtomFamilySelectorValue(
    availableFieldMetadataItemsForFilterFamilySelector,
    {
      objectMetadataItemId: objectMetadataItem.id,
    },
  );

  const currentRecordFilterGroups = useAtomComponentStateValue(
    currentRecordFilterGroupsComponentState,
  );

  const { setRecordFilterUsedInAdvancedFilterDropdownRow } =
    useSetRecordFilterUsedInAdvancedFilterDropdownRow();

  const { createEmptyRecordFilterFromFieldMetadataItem } =
    useCreateEmptyRecordFilterFromFieldMetadataItem();

  const handleClick = () => {
    if (!isDefined(currentView)) {
      throw new Error('Missing current view id');
    }

    const alreadyHasAdvancedFilterGroup = currentRecordFilterGroups.length > 0;

    if (!alreadyHasAdvancedFilterGroup) {
      const newRecordFilterGroup = {
        id: v4(),
        viewId: currentView.id,
        logicalOperator: RecordFilterGroupLogicalOperator.AND,
      };

      upsertRecordFilterGroup(newRecordFilterGroup);

      const defaultFieldMetadataItem =
        availableFieldMetadataItemsForFilter.find(
          (fieldMetadataItem) =>
            fieldMetadataItem.id ===
            objectMetadataItem?.labelIdentifierFieldMetadataId,
        ) ?? availableFieldMetadataItemsForFilter[0];

      if (!isDefined(defaultFieldMetadataItem)) {
        throw new Error('Missing default filter definition');
      }

      const { newRecordFilter } = createEmptyRecordFilterFromFieldMetadataItem(
        defaultFieldMetadataItem,
      );

      newRecordFilter.recordFilterGroupId = newRecordFilterGroup.id;

      upsertRecordFilter(newRecordFilter);

      setRecordFilterUsedInAdvancedFilterDropdownRow(newRecordFilter);
    }

    closeObjectFilterDropdown(ViewBarFilterDropdownIds.MAIN);
    openAdvancedFilterDropdown({
      dropdownComponentInstanceIdFromProps: ViewBarFilterDropdownIds.ADVANCED,
    });
  };

  return (
    <SelectableListItem
      itemId={VIEW_BAR_FILTER_BOTTOM_MENU_ITEM_IDS.ADVANCED_FILTER}
      onEnter={handleClick}
    >
      <MenuItem
        text={t`Advanced filter`}
        onClick={handleClick}
        LeftIcon={IconFilter}
        focused={isSelectedItemId}
        RightComponent={
          advancedFilterQuerySubFilterCount > 0 ? (
            <StyledPillContainer>
              <Pill label={advancedFilterQuerySubFilterCount.toString()} />
            </StyledPillContainer>
          ) : undefined
        }
      />
    </SelectableListItem>
  );
};
