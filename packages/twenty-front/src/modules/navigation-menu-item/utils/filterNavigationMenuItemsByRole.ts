import { isNavigationMenuItemFolder } from '@/navigation-menu-item/utils/isNavigationMenuItemFolder';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { type View } from '@/views/types/View';
import { isDefined } from 'twenty-shared/utils';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';

// Object names (nameSingular) visible to the Member role
const MEMBER_VISIBLE_OBJECTS = new Set([
  'lead',
  'call',
  'policy',
  'note',
  'task',
]);

// Resolve the underlying object for a navigation menu item
const resolveObjectNameSingular = (
  item: NavigationMenuItem,
  objectMetadataItems: ObjectMetadataItem[],
  views: View[],
): string | null => {
  // View-based items: look up view → objectMetadataId → nameSingular
  if (isDefined(item.viewId)) {
    const view = views.find((v) => v.id === item.viewId);

    if (!isDefined(view)) {
      return null;
    }

    const objectMetadata = objectMetadataItems.find(
      (meta) => meta.id === view.objectMetadataId,
    );

    return objectMetadata?.nameSingular ?? null;
  }

  // Record-based items: look up targetObjectMetadataId → nameSingular
  if (isDefined(item.targetObjectMetadataId)) {
    const objectMetadata = objectMetadataItems.find(
      (meta) => meta.id === item.targetObjectMetadataId,
    );

    return objectMetadata?.nameSingular ?? null;
  }

  return null;
};

export const filterNavigationMenuItemsByRole = (
  items: NavigationMenuItem[],
  isAdmin: boolean,
  objectMetadataItems: ObjectMetadataItem[],
  views: View[],
): NavigationMenuItem[] => {
  if (isAdmin) {
    return items;
  }

  // Pre-compute which folder IDs contain at least one visible child
  const visibleFolderIds = new Set<string>();

  for (const item of items) {
    if (!isDefined(item.folderId)) {
      continue;
    }

    const nameSingular = resolveObjectNameSingular(
      item,
      objectMetadataItems,
      views,
    );

    if (isDefined(nameSingular) && MEMBER_VISIBLE_OBJECTS.has(nameSingular)) {
      visibleFolderIds.add(item.folderId);
    }
  }

  return items.filter((item) => {
    // Folders: keep only if at least one child is visible
    if (isNavigationMenuItemFolder(item)) {
      return visibleFolderIds.has(item.id);
    }

    const nameSingular = resolveObjectNameSingular(
      item,
      objectMetadataItems,
      views,
    );

    // Links and unresolvable items are always shown
    if (!isDefined(nameSingular)) {
      return true;
    }

    return MEMBER_VISIBLE_OBJECTS.has(nameSingular);
  });
};
