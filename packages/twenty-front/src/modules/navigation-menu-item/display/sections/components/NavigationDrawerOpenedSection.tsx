import { useIdentifyActiveNavigationMenuItems } from '@/navigation-menu-item/display/hooks/useIdentifyActiveNavigationMenuItems';
import { useMemberSidebarObjectMetadataItems } from '@/navigation-menu-item/display/hooks/useMemberSidebarObjectMetadataItems';
import { useNavigationMenuItemSectionItems } from '@/navigation-menu-item/display/hooks/useNavigationMenuItemSectionItems';
import { getObjectMetadataForNavigationMenuItem } from '@/navigation-menu-item/display/object/utils/getObjectMetadataForNavigationMenuItem';
import { NavigationDrawerSectionForObjectMetadataItems } from '@/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { Collapsible } from 'twenty-ui/primitives/layout';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const NavigationDrawerOpenedSection = () => {
  const { t } = useLingui();

  const { activeObjectMetadataItems } = useFilteredObjectMetadataItems();

  const { objectMetadataIdForOpenedSection } =
    useIdentifyActiveNavigationMenuItems();

  // OMNIA-CUSTOM: hide Opened when the sidebar already lists the object through any OBJECT, VIEW or
  // RECORD item (upstream misses other views), or for members through their list, hidden until it loads.
  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);
  const workspaceSectionItems = useNavigationMenuItemSectionItems();
  const memberSidebar = useMemberSidebarObjectMetadataItems();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const views = useAtomStateValue(viewsSelector);

  const objectMetadataItem = activeObjectMetadataItems.find(
    (item) => item.id === objectMetadataIdForOpenedSection,
  );

  if (!isDefined(objectMetadataItem)) {
    return null;
  }

  // OMNIA-CUSTOM: the sidebar de-dup described above.
  const isAlreadyInWorkspaceSidebar = hasLayoutsPermission
    ? workspaceSectionItems.some(
        (navigationMenuItem) =>
          getObjectMetadataForNavigationMenuItem(
            navigationMenuItem,
            objectMetadataItems,
            views,
          )?.id === objectMetadataItem.id,
      )
    : !memberSidebar.isLoaded ||
      memberSidebar.objectMetadataItems.some(
        (memberObjectMetadataItem) =>
          memberObjectMetadataItem.id === objectMetadataItem.id,
      );

  if (isAlreadyInWorkspaceSidebar) {
    return null;
  }

  return (
    <Collapsible.Root open>
      <Collapsible.Panel>
        <NavigationDrawerSectionForObjectMetadataItems
          sectionTitle={t`Opened`}
          objectMetadataItems={[objectMetadataItem]}
        />
      </Collapsible.Panel>
    </Collapsible.Root>
  );
};
