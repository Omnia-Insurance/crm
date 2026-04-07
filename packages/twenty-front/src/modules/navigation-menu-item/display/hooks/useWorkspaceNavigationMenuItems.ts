import { NavigationMenuItemType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { useNavigationMenuItemsData } from './useNavigationMenuItemsData';

export const useWorkspaceNavigationMenuItems = (): {
  objectMetadataIdsInWorkspaceNav: Set<string>;
} => {
  const { workspaceNavigationMenuItems: rawWorkspaceNavigationMenuItems } =
    useNavigationMenuItemsData();

  const views = useAtomStateValue(viewsSelector);

  // Build a viewId → objectMetadataId lookup so we can resolve VIEW nav items
  const objectMetadataIdByViewId = new Map(
    views
      .filter((view) => isDefined(view.objectMetadataId))
      .map((view) => [view.id, view.objectMetadataId]),
  );

  // Collect object metadata IDs from OBJECT items (via targetObjectMetadataId)
  // and VIEW items (via viewId → view.objectMetadataId).
  const objectMetadataIdsInWorkspaceNav = new Set<string>();

  for (const item of rawWorkspaceNavigationMenuItems) {
    if (
      item.type === NavigationMenuItemType.OBJECT &&
      isDefined(item.targetObjectMetadataId)
    ) {
      objectMetadataIdsInWorkspaceNav.add(item.targetObjectMetadataId);
    } else if (
      item.type === NavigationMenuItemType.VIEW &&
      isDefined(item.viewId)
    ) {
      const objectMetadataId = objectMetadataIdByViewId.get(item.viewId);

      if (isDefined(objectMetadataId)) {
        objectMetadataIdsInWorkspaceNav.add(objectMetadataId);
      }
    }
  }

  return {
    objectMetadataIdsInWorkspaceNav,
  };
};
