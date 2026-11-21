import { objectShowInSidebarByObjectMetadataIdSelector } from '@/object-metadata/states/objectShowInSidebarByObjectMetadataIdSelector';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

// Fails closed: an object missing from the map, or a map not loaded yet, stays out of the sidebar
export const useIsObjectShownInSidebar = (
  objectMetadataId: string,
): boolean => {
  const objectShowInSidebarByObjectMetadataId = useAtomStateValue(
    objectShowInSidebarByObjectMetadataIdSelector,
  );

  return objectShowInSidebarByObjectMetadataId?.[objectMetadataId] === true;
};
