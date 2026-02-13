import { useLingui } from '@lingui/react/macro';

import { useWorkspaceNavigationMenuItems } from '@/navigation-menu-item/hooks/useWorkspaceNavigationMenuItems';
import { NavigationDrawerItemForObjectMetadataItem } from '@/object-metadata/components/NavigationDrawerItemForObjectMetadataItem';
import { NavigationDrawerSectionForObjectMetadataItemsSkeletonLoader } from '@/object-metadata/components/NavigationDrawerSectionForObjectMetadataItemsSkeletonLoader';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useIsPrefetchLoading } from '@/prefetch/hooks/useIsPrefetchLoading';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { NavigationDrawerAnimatedCollapseWrapper } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerAnimatedCollapseWrapper';
import { NavigationDrawerSection } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerSection';
import { NavigationDrawerSectionTitle } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerSectionTitle';
import { useNavigationSection } from '@/ui/navigation/navigation-drawer/hooks/useNavigationSection';
import { useRecoilValue } from 'recoil';
import { PermissionFlagType } from '~/generated/graphql';

/* eslint-disable lingui/no-unlocalized-strings */
const ADMIN_SIDEBAR_ITEMS = [
  'dashboards',
  'leads',
  'agents',
  'calls',
  'policies',
  'products',
  'carriers',
  'product types',
  'lead sources',
  'workflows',
];

const MEMBER_SIDEBAR_ITEMS = ['leads', 'calls', 'policies', 'notes', 'tasks'];
/* eslint-enable lingui/no-unlocalized-strings */

export const WorkspaceNavigationMenuItems = () => {
  const { workspaceNavigationMenuItemsObjectMetadataItems } =
    useWorkspaceNavigationMenuItems();

  const loading = useIsPrefetchLoading();
  const { t } = useLingui();

  const { toggleNavigationSection, isNavigationSectionOpenState } =
    useNavigationSection('ObjectsWorkspace');
  const isNavigationSectionOpen = useRecoilValue(isNavigationSectionOpenState);

  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const permissionFlagMap = usePermissionFlagMap();

  if (loading) {
    return <NavigationDrawerSectionForObjectMetadataItemsSkeletonLoader />;
  }

  const itemsWithReadPermission =
    workspaceNavigationMenuItemsObjectMetadataItems.filter(
      (objectMetadataItem) =>
        getObjectPermissionsForObject(
          objectPermissionsByObjectMetadataId,
          objectMetadataItem.id,
        ).canReadObjectRecords,
    );

  const isAdmin = permissionFlagMap[PermissionFlagType.ROLES];
  const allowedItems = isAdmin ? ADMIN_SIDEBAR_ITEMS : MEMBER_SIDEBAR_ITEMS;

  const filteredItems = itemsWithReadPermission
    .filter((item) => allowedItems.includes(item.labelPlural.toLowerCase()))
    .sort(
      (itemA, itemB) =>
        allowedItems.indexOf(itemA.labelPlural.toLowerCase()) -
        allowedItems.indexOf(itemB.labelPlural.toLowerCase()),
    );

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <NavigationDrawerSection>
      <NavigationDrawerAnimatedCollapseWrapper>
        <NavigationDrawerSectionTitle
          label={t`Workspace`}
          onClick={() => toggleNavigationSection()}
        />
      </NavigationDrawerAnimatedCollapseWrapper>
      {isNavigationSectionOpen &&
        filteredItems.map((objectMetadataItem) => (
          <NavigationDrawerItemForObjectMetadataItem
            key={`navigation-drawer-item-${objectMetadataItem.id}`}
            objectMetadataItem={objectMetadataItem}
          />
        ))}
    </NavigationDrawerSection>
  );
};
