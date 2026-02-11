import { useRecoilValue } from 'recoil';

import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { coreViewsState } from '@/views/states/coreViewState';
import { convertCoreViewToView } from '@/views/utils/convertCoreViewToView';

import { isDefined } from 'twenty-shared/utils';
import { usePrefetchedNavigationMenuItemsData } from './usePrefetchedNavigationMenuItemsData';
import { useSortedNavigationMenuItems } from './useSortedNavigationMenuItems';

export const useWorkspaceNavigationMenuItems = (): {
  workspaceNavigationMenuItemsObjectMetadataItems: ObjectMetadataItem[];
} => {
  const { workspaceNavigationMenuItemsSorted } = useSortedNavigationMenuItems();
  const { workspaceNavigationMenuItems: rawWorkspaceNavigationMenuItems } =
    usePrefetchedNavigationMenuItemsData();
  const coreViews = useRecoilValue(coreViewsState);

  const views = coreViews.map(convertCoreViewToView);

  const { activeNonSystemObjectMetadataItems } =
    useFilteredObjectMetadataItems();

  // Build a map from objectMetadataId to objectMetadataItem for fast lookup
  const objectMetadataById = new Map(
    activeNonSystemObjectMetadataItems.map((item) => [item.id, item]),
  );

  // Build a map from viewId to objectMetadataId
  const viewIdToObjectMetadataId = new Map(
    views.map((view) => [view.id, view.objectMetadataId]),
  );

  // Iterate over sorted navigation menu items to preserve position order
  const seen = new Set<string>();
  const orderedItems: ObjectMetadataItem[] = [];

  for (const navItem of workspaceNavigationMenuItemsSorted) {
    let objectMetadataId: string | undefined;

    if (isDefined(navItem.viewId)) {
      objectMetadataId = viewIdToObjectMetadataId.get(navItem.viewId);
    }

    if (
      !isDefined(objectMetadataId) &&
      isDefined(navItem.targetObjectMetadataId)
    ) {
      objectMetadataId = navItem.targetObjectMetadataId;
    }

    if (isDefined(objectMetadataId) && !seen.has(objectMetadataId)) {
      const metadataItem = objectMetadataById.get(objectMetadataId);
      if (isDefined(metadataItem)) {
        seen.add(objectMetadataId);
        orderedItems.push(metadataItem);
      }
    }
  }

  // Also include items from raw workspace navigation menu items
  // that have targetObjectMetadataId but no sorted entry
  for (const rawItem of rawWorkspaceNavigationMenuItems) {
    const targetId = rawItem.targetObjectMetadataId;
    if (isDefined(targetId) && !seen.has(targetId)) {
      const metadataItem = objectMetadataById.get(targetId);
      if (isDefined(metadataItem)) {
        seen.add(targetId);
        orderedItems.push(metadataItem);
      }
    }
  }

  return {
    workspaceNavigationMenuItemsObjectMetadataItems: orderedItems,
  };
};
