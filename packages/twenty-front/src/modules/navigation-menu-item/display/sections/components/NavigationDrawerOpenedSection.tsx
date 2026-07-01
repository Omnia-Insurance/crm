import { useIdentifyActiveNavigationMenuItems } from '@/navigation-menu-item/display/hooks/useIdentifyActiveNavigationMenuItems';
import { useSortedNavigationMenuItems } from '@/navigation-menu-item/display/hooks/useSortedNavigationMenuItems';
import { getObjectMetadataForNavigationMenuItem } from '@/navigation-menu-item/display/object/utils/getObjectMetadataForNavigationMenuItem';
import { NavigationDrawerSectionForObjectMetadataItems } from '@/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { AnimatedExpandableContainer } from 'twenty-ui/layout';

export const NavigationDrawerOpenedSection = () => {
  const { t } = useLingui();

  const { activeObjectMetadataItems } = useFilteredObjectMetadataItems();

  const { objectMetadataIdForOpenedSection } =
    useIdentifyActiveNavigationMenuItems();

  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const views = useAtomStateValue(viewsSelector);
  const { workspaceNavigationMenuItemsSorted } = useSortedNavigationMenuItems();

  const objectMetadataItem = activeObjectMetadataItems.find(
    (item) => item.id === objectMetadataIdForOpenedSection,
  );

  if (!isDefined(objectMetadataItem)) {
    return null;
  }

  // OMNIA-CUSTOM: also suppress the "Opened" section when the object is already
  // visible in the workspace sidebar via showInSidebar permission.
  const isAlreadyShownInWorkspaceSection =
    !hasLayoutsPermission &&
    getObjectPermissionsForObject(
      objectPermissionsByObjectMetadataId,
      objectMetadataItem.id,
    ).showInSidebar;

  // Layout-capable users see the editable workspace tree, so use the actual
  // navigation items to avoid showing the same object again under "Opened".
  const isAlreadyShownInEditableWorkspaceSection =
    hasLayoutsPermission &&
    workspaceNavigationMenuItemsSorted.some((navigationMenuItem) => {
      const workspaceObjectMetadataItem =
        getObjectMetadataForNavigationMenuItem(
          navigationMenuItem,
          objectMetadataItems,
          views,
        );

      return workspaceObjectMetadataItem?.id === objectMetadataItem.id;
    });

  if (
    isAlreadyShownInWorkspaceSection ||
    isAlreadyShownInEditableWorkspaceSection
  ) {
    return null;
  }

  return (
    <AnimatedExpandableContainer isExpanded>
      <NavigationDrawerSectionForObjectMetadataItems
        sectionTitle={t`Opened`}
        objectMetadataItems={[objectMetadataItem]}
      />
    </AnimatedExpandableContainer>
  );
};
