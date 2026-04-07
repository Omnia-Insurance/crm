import { NavigationMenuItemType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useNavigationMenuItemsData } from './useNavigationMenuItemsData';

export const useWorkspaceNavigationMenuItems = (): {
  objectMetadataIdsInWorkspaceNav: Set<string>;
} => {
  const { workspaceNavigationMenuItems: rawWorkspaceNavigationMenuItems } =
    useNavigationMenuItemsData();

  // Collect object metadata IDs from both OBJECT and VIEW items —
  // VIEW items (e.g. "All Policies · Policy") also target an object
  // and should suppress the "Opened" section for that object.
  const objectMetadataIdsInWorkspaceNav = new Set(
    rawWorkspaceNavigationMenuItems
      .filter(
        (item) =>
          item.type === NavigationMenuItemType.OBJECT ||
          item.type === NavigationMenuItemType.VIEW,
      )
      .map((item) => item.targetObjectMetadataId)
      .filter((objectMetadataId) => isDefined(objectMetadataId)),
  );

  return {
    objectMetadataIdsInWorkspaceNav,
  };
};
